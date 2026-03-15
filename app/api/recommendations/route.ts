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
    // Collect ALL unique item IDs (don't trust user_id classification from AI)
    const allItemIds = new Set<number>();

    for (const section of sections) {
        for (const suggestion of section.suggestions || []) {
            for (const item of suggestion.items || []) {
                const id = Number(item.id);
                if (id) allItemIds.add(id);
            }
        }
    }

    if (allItemIds.size === 0) return sections;

    const idArray = Array.from(allItemIds);

    // Fetch from BOTH tables for ALL IDs — avoids mis-classification
    // wardrobe_items = general catalog (283 items, used by n8n AI tools)
    // wardrobe_user_items = user's personal wardrobe
    const [userItemsResult, catalogItemsResult] = await Promise.all([
        supabase
            .from("wardrobe_user_items")
            .select("id, image_url, item_name, color, shade, has_print, clothing_type, notes, user_id")
            .in("id", idArray),
        supabase
            .from("wardrobe_items")
            .select("id, image_url, item_name, item_name_en, clothing_type, color, shade, has_print")
            .in("id", idArray),
    ]);

    // Build lookup maps (user items take priority over catalog)
    const userMap = new Map<number, any>();
    for (const row of userItemsResult.data || []) {
        userMap.set(row.id, row);
    }
    const catalogMap = new Map<number, any>();
    for (const row of catalogItemsResult.data || []) {
        catalogMap.set(row.id, row);
    }

    console.log("[enrichSections] Total IDs:", allItemIds.size,
        "Found:", userMap.size, "user +", catalogMap.size, "catalog items from DB.",
        "Missing IDs:", idArray.filter(id => !userMap.has(id) && !catalogMap.has(id)));

    // Merge DB data into sections — DB image_url always wins (cached URLs may expire)
    return sections.map((section: any) => ({
        ...section,
        suggestions: (section.suggestions || []).map((suggestion: any) => ({
            ...suggestion,
            items: (suggestion.items || []).map((item: any) => {
                const id = Number(item.id);
                // Try user items first, then basic items
                const userDb = userMap.get(id);
                if (userDb) {
                    return {
                        ...item,
                        image_url: userDb.image_url || item.image_url,
                        name: item.name || userDb.item_name,
                        color: item.color || userDb.color,
                        shade: item.shade || userDb.shade,
                        has_print: item.has_print || userDb.has_print,
                        clothing_type: item.clothing_type || userDb.clothing_type,
                        notes: item.notes || userDb.notes,
                        user_id: item.user_id || userDb.user_id,
                    };
                }
                const catalogDb = catalogMap.get(id);
                if (catalogDb) {
                    return {
                        ...item,
                        image_url: catalogDb.image_url || item.image_url,
                        name: item.name || catalogDb.item_name || catalogDb.item_name_en,
                        clothing_type: item.clothing_type || catalogDb.clothing_type,
                        color: item.color || catalogDb.color,
                        shade: item.shade || catalogDb.shade,
                        has_print: item.has_print || catalogDb.has_print,
                    };
                }
                return item;
            }),
        })),
    }));
}

/** Normalize look_sections to flat array of {title, suggestions} sections.
 *  n8n cron writes: [{"sections": [{title, suggestions}, ...]}]
 *  Our POST writes: [{title, suggestions}, ...]
 */
function normalizeSections(val: unknown): any[] {
    try {
        let arr: any[];
        if (Array.isArray(val)) {
            arr = val;
        } else if (typeof val === "string") {
            const parsed = JSON.parse(val);
            arr = Array.isArray(parsed) ? parsed : [];
        } else {
            return [];
        }

        // Unwrap n8n wrapper: [{sections: [...]}] → [...]
        if (arr.length === 1 && arr[0]?.sections && Array.isArray(arr[0].sections)) {
            return arr[0].sections;
        }

        // Unwrap broken n8n Supabase node write:
        // n8n wrote the whole DB row as look_sections[0], with actual data
        // nested in look_sections[0].look_sections as a JSON string
        if (arr.length === 1 && arr[0]?.look_sections && !arr[0]?.suggestions?.length) {
            const nested = arr[0].look_sections;
            // Could be a JSON string or already parsed
            const inner = typeof nested === "string" ? JSON.parse(nested) : nested;
            if (Array.isArray(inner) && inner.length > 0) {
                // Recurse to handle any further wrapping
                return normalizeSections(inner);
            }
        }

        return arr;
    } catch {
        return [];
    }
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

        console.log("[Recommendations GET] Fetching for user:", user.id);

        // Fetch last few rows — cron sometimes writes empty [], so we need fallback
        const { data: rows, error } = await supabase
            .from("main_recommendations")
            .select("run_date, look_sections")
            .eq("user_id", user.id)
            .order("run_date", { ascending: false })
            .limit(7);

        if (error) {
            console.error("[Recommendations GET] DB error:", error);
            return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
        }

        if (!rows || rows.length === 0) {
            console.log("[Recommendations GET] No rows found for user:", user.id);
            return NextResponse.json({ sections: [], stale: true });
        }

        // Find the first row with non-empty data
        let foundRow: any = null;
        let raw: any[] = [];
        for (const row of rows) {
            if (row.look_sections == null) continue;
            const normalized = normalizeSections(row.look_sections);
            if (normalized.length > 0) {
                foundRow = row;
                raw = normalized;
                break;
            }
        }

        if (!foundRow || raw.length === 0) {
            console.log("[Recommendations GET] All rows empty for user:", user.id);
            return NextResponse.json({ sections: [], stale: true });
        }

        const today = new Date().toISOString().slice(0, 10);
        const isStale = foundRow.run_date !== today;
        console.log("[Recommendations GET] Using row from", foundRow.run_date,
            "with", raw.length, "sections. stale:", isStale);

        const enriched = await enrichSectionsWithImages(supabase, raw);
        const { sections, stats } = filterSections(enriched, 2);

        console.log("[Recommendations GET] After filter:", sections.length, "sections. Stats:", JSON.stringify(stats));
        console.log("[Recommendations GET] Raw sections count:", raw.length,
            "enriched items sample:", enriched[0]?.suggestions?.[0]?.items?.slice(0, 2)?.map((i: any) => ({ id: i.id, name: i.name, image_url: !!i.image_url })));

        // Self-heal: write cleaned data back ONLY if we still have sections
        // Never write empty data — that would destroy the originals
        if (stats.totalRemoved > 0 && sections.length > 0) {
            void supabase
                .from("main_recommendations")
                .update({ look_sections: sections })
                .eq("user_id", user.id)
                .eq("run_date", foundRow.run_date)
                .then(({ error: updateErr }) => {
                    if (updateErr) {
                        console.error("[Recommendations GET] Self-heal write failed:", updateErr);
                    }
                });
        }

        // Return sections + stale flag so frontend can trigger background refresh
        return NextResponse.json({
            sections,
            stale: isStale || sections.length === 0,
        });
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
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            // Try update first (for today's row), then insert if no row exists
            const { data: updated, error: updateErr } = await supabase
                .from("main_recommendations")
                .update({ look_sections: sections })
                .eq("user_id", user.id)
                .eq("run_date", today)
                .select("user_id")
                .maybeSingle();

            if (!updated && !updateErr) {
                // No row for today — insert new
                const { error: insertErr } = await supabase
                    .from("main_recommendations")
                    .insert({
                        user_id: user.id,
                        run_date: today,
                        look_sections: sections,
                    });
                if (insertErr) {
                    console.error("[Recommendations POST] Insert failed:", insertErr);
                } else {
                    console.log("[Recommendations POST] Inserted new row for", today);
                }
            } else if (updateErr) {
                console.error("[Recommendations POST] Update failed:", updateErr);
            } else {
                console.log("[Recommendations POST] Updated existing row for", today);
            }
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
                sections = normalizeSections(row.look_sections);
                console.log("[Recommendations POST] Re-read", sections.length, "sections from DB");
            }

            // Enrich DB-read sections too (may have been saved without images by n8n)
            if (sections.length > 0) {
                sections = await enrichSectionsWithImages(supabase, sections);
            }
        }

        const { sections: cleaned, stats } = filterSections(sections, 2);
        console.log("[Recommendations POST] Final:", cleaned.length, "sections after filter. Stats:", JSON.stringify(stats));
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
