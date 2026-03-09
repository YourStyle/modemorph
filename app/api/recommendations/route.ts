import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth-server";
import { filterSections } from "@/lib/recommendation-filters";

export const dynamic = "force-dynamic";

/**
 * Enrich AI recommendation items with image_url and other fields from DB.
 * AI returns only {id, name, user_id} — we need image_url for the UI to display them.
 * User items → wardrobe_user_items, basic items (user_id=null) → basic_wardrobe_items.
 */
async function enrichSectionsWithImages(supabase: any, sections: any[]): Promise<any[]> {
    // Collect all item IDs split by type
    const userItemIds = new Set<number>();
    const basicItemIds = new Set<number>();

    for (const section of sections) {
        for (const suggestion of section.suggestions || []) {
            for (const item of suggestion.items || []) {
                const id = Number(item.id);
                if (!id) continue;
                if (item.user_id) {
                    userItemIds.add(id);
                } else {
                    basicItemIds.add(id);
                }
            }
        }
    }

    // Batch-fetch from both tables in parallel
    const [userItemsResult, basicItemsResult] = await Promise.all([
        userItemIds.size > 0
            ? supabase
                .from("wardrobe_user_items")
                .select("id, image_url, item_name, color, shade, has_print, clothing_type, notes")
                .in("id", Array.from(userItemIds))
            : { data: [] },
        basicItemIds.size > 0
            ? supabase
                .from("basic_wardrobe_items")
                .select("id, image_url, name_ru, name_en, clothing_type")
                .in("id", Array.from(basicItemIds))
            : { data: [] },
    ]);

    // Build lookup maps
    const userMap = new Map<number, any>();
    for (const row of userItemsResult.data || []) {
        userMap.set(row.id, row);
    }
    const basicMap = new Map<number, any>();
    for (const row of basicItemsResult.data || []) {
        basicMap.set(row.id, row);
    }

    console.log("[enrichSections] Found", userMap.size, "user items,", basicMap.size, "basic items from DB");

    // Merge DB data into sections
    return sections.map((section: any) => ({
        ...section,
        suggestions: (section.suggestions || []).map((suggestion: any) => ({
            ...suggestion,
            items: (suggestion.items || []).map((item: any) => {
                const id = Number(item.id);
                if (item.user_id) {
                    const db = userMap.get(id);
                    if (db) {
                        return {
                            ...item,
                            image_url: item.image_url || db.image_url,
                            name: item.name || db.item_name,
                            color: item.color || db.color,
                            shade: item.shade || db.shade,
                            has_print: item.has_print || db.has_print,
                            clothing_type: item.clothing_type || db.clothing_type,
                            notes: item.notes || db.notes,
                        };
                    }
                } else {
                    const db = basicMap.get(id);
                    if (db) {
                        return {
                            ...item,
                            image_url: item.image_url || db.image_url,
                            name: item.name || db.name_ru || db.name_en,
                            clothing_type: item.clothing_type || db.clothing_type,
                        };
                    }
                }
                return item;
            }),
        })),
    }));
}

export async function GET(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        const { data: row, error } = await supabase
            .from("main_recommendations")
            .select("run_date, look_sections")
            .eq("user_id", user.id) // не полагаемся только на RLS
            .order("run_date", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("[Recommendations GET] DB error:", error);
            return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
        }

        // 5) Ничего нет — отдаём пустой массив
        if (!row || row.look_sections == null) {
            return NextResponse.json([]);
        }

        // 6) Поле look_sections может быть JSONB (объект/массив) или строкой — аккуратно нормализуем к массиву
        const normalize = (val: unknown): any[] => {
            try {
                if (Array.isArray(val)) return val;
                if (typeof val === "string") {
                    const parsed = JSON.parse(val);
                    return Array.isArray(parsed) ? parsed : [];
                }
                return [];
            } catch {
                return [];
            }
        };

        const raw = normalize(row.look_sections);

        // Enrich items that may have been saved without image_url
        const enriched = await enrichSectionsWithImages(supabase, raw);
        const { sections, stats } = filterSections(enriched, 2);

        if (stats.totalRemoved > 0) {
            console.log("[Recommendations GET] Filtered anomalies:", stats);

            // Self-heal: write cleaned data back (fire-and-forget)
            void supabase
                .from("main_recommendations")
                .update({ look_sections: sections })
                .eq("user_id", user.id)
                .eq("run_date", row.run_date)
                .then(({ error: updateErr }) => {
                    if (updateErr) {
                        console.error("[Recommendations GET] Self-heal write failed:", updateErr);
                    } else {
                        console.log("[Recommendations GET] Self-heal: cleaned data written back");
                    }
                });
        }

        return NextResponse.json(sections);
    } catch (e) {
        console.error("[Recommendations GET] Error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST — trigger AI generation of outfit recommendations
 * Calls the AI service /webhook-test/recommendations endpoint,
 * saves results to main_recommendations, and returns them.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // Derive base URL: strip /webhook suffix from env var
        const envUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook";
        const aiBaseUrl = envUrl.replace(/\/webhook\/?$/, "");
        const authToken = req.headers.get("authorization")?.replace("Bearer ", "");

        // Get weather for the request (from DB cache or fallback)
        const weather = await getWeatherForUser(supabase, user.id);

        console.log("[Recommendations POST] Triggering AI generation for user:", user.id, "weather:", weather);

        const response = await fetch(`${aiBaseUrl}/webhook/recommendations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authToken && { Authorization: `Bearer ${authToken}` }),
            },
            body: JSON.stringify({
                user_id: user.id,
                weather,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error("[Recommendations POST] AI service error:", response.status, errorText);
            return NextResponse.json({ error: "AI service error" }, { status: 502 });
        }

        // AI service (n8n) may save to DB itself.
        // Try to parse response, but also re-read from DB as fallback.
        const responseText = await response.text();
        console.log("[Recommendations POST] Raw AI response length:", responseText.length, "first 300:", responseText.slice(0, 300));

        let sections: any[] = [];

        try {
            const aiData = JSON.parse(responseText);

            // Normalize: n8n can return various shapes
            // 1. [{title, suggestions}] — array of sections (ideal)
            // 2. {sections: [...]} — object wrapper
            // 3. [{sections: [...]}] — n8n array wrapper with one element
            // 4. [{json: {sections: [...]}}] — n8n full wrapper
            if (Array.isArray(aiData)) {
                if (aiData.length > 0 && aiData[0]?.suggestions) {
                    // Shape 1: direct array of sections
                    sections = aiData;
                } else if (aiData.length === 1 && aiData[0]?.sections) {
                    // Shape 3: n8n wrapper [{sections: [...]}]
                    sections = aiData[0].sections;
                } else if (aiData.length === 1 && aiData[0]?.json?.sections) {
                    // Shape 4: n8n full wrapper [{json: {sections: [...]}}]
                    sections = aiData[0].json.sections;
                } else if (aiData.length > 0) {
                    // Unknown array — use as-is
                    sections = aiData;
                }
            } else if (aiData?.sections) {
                // Shape 2: {sections: [...]}
                sections = aiData.sections;
            } else if (aiData?.look_sections) {
                sections = aiData.look_sections;
            }
        } catch {
            console.log("[Recommendations POST] Could not parse AI response as JSON, will re-read from DB");
        }

        // Enrich items with image_url and other fields from DB
        if (sections.length > 0) {
            sections = await enrichSectionsWithImages(supabase, sections);
        }

        // If we got sections from the response, save them (now with images)
        if (sections.length > 0) {
            const now = new Date().toISOString();
            await supabase
                .from("main_recommendations")
                .upsert({
                    user_id: user.id,
                    run_date: now,
                    look_sections: sections,
                }, { onConflict: "user_id" });
            console.log("[Recommendations POST] Saved", sections.length, "enriched sections for user:", user.id);
        } else {
            // n8n may have saved directly — wait a moment and re-read from DB
            console.log("[Recommendations POST] No sections in response, re-reading from DB...");
            await new Promise(r => setTimeout(r, 2000));

            const { data: row } = await supabase
                .from("main_recommendations")
                .select("look_sections")
                .eq("user_id", user.id)
                .order("run_date", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (row?.look_sections) {
                const val = row.look_sections;
                if (Array.isArray(val)) {
                    sections = val;
                } else if (typeof val === "string") {
                    try { sections = JSON.parse(val); } catch {}
                }
                console.log("[Recommendations POST] Re-read", sections.length, "sections from DB");
            }

            // Enrich DB-read sections too (may have been saved without images by n8n)
            if (sections.length > 0) {
                sections = await enrichSectionsWithImages(supabase, sections);
            }
        }

        const { sections: cleaned } = filterSections(sections, 2);
        return NextResponse.json(cleaned);
    } catch (e: any) {
        console.error("[Recommendations POST] Error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/** Get weather from DB cache or return Moscow fallback */
async function getWeatherForUser(supabase: any, userId: string) {
    const fallback = { location: "Москва", temperature: 20, description: "ясно" };

    try {
        // Try user's cached weather first (last hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data } = await supabase
            .from("weather_cache")
            .select("temperature, description, city_name")
            .eq("user_id", userId)
            .gte("updated_at", oneHourAgo)
            .order("updated_at", { ascending: false })
            .limit(1);

        if (data?.[0]) {
            return {
                location: data[0].city_name || "Москва",
                temperature: data[0].temperature ?? 20,
                description: data[0].description || "ясно",
            };
        }

        // Fallback: any recent weather in the DB (Moscow or any city)
        const { data: anyWeather } = await supabase
            .from("weather_cache")
            .select("temperature, description, city_name")
            .gte("updated_at", oneHourAgo)
            .order("updated_at", { ascending: false })
            .limit(1);

        if (anyWeather?.[0]) {
            return {
                location: anyWeather[0].city_name || "Москва",
                temperature: anyWeather[0].temperature ?? 20,
                description: anyWeather[0].description || "ясно",
            };
        }
    } catch (e) {
        console.error("[getWeatherForUser] Error:", e);
    }

    return fallback;
}
