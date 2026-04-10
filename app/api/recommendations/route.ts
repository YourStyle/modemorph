import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth-server";
import { filterSections } from "@/lib/recommendation-filters";
import { openrouterChat } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

/**
 * Enrich AI recommendation items with image_url and other fields from DB.
 * AI returns only {id, name, user_id} — we need image_url for the UI to display them.
 * User items → wardrobe_user_items, basic items (user_id=null) → basic_wardrobe_items.
 */
async function enrichSectionsWithImages(supabase: any, sections: any[], userId?: string): Promise<any[]> {
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
            .in("id", idArray)
            // Only fetch items belonging to the current user — prevents cross-user n8n bug
            // from marking other users' items as "Ваше"
            .eq("user_id", userId || ""),
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

        const enriched = await enrichSectionsWithImages(supabase, raw, user.id);
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

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://modemorph-ai:8000";

// A/B split: probability of using CLIP vs Gemini (0.0 - 1.0)
const CLIP_PROBABILITY = 0.5;

/**
 * POST — generate outfit recommendations.
 * Uses A/B split: ~50% CLIP model ("Рекомендовано нашей моделью"),
 *                 ~50% Gemini ("Рекомендовано AI").
 * Both sources include partner catalog items and respect weather.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // Get weather, gender, and wardrobe in parallel
        const [weather, profileResult, wardrobeResult] = await Promise.all([
            getWeatherForUser(supabase, user.id),
            supabase.from("user_profiles").select("gender").eq("user_id", user.id).maybeSingle(),
            supabase.from("wardrobe_user_items")
                .select("id, item_name, color, shade, style, material, clothing_type, has_print, image_url, user_id")
                .eq("user_id", user.id)
                .limit(60),
        ]);

        const gender = profileResult.data?.gender ?? null;
        const wardrobeItems = wardrobeResult.data || [];

        console.log("[Recs POST] user:", user.id, "wardrobe:", wardrobeItems.length, "weather:", weather);

        let sections: any[] = [];

        // --- Generate Gemini recommendations (from user's wardrobe) ---
        if (wardrobeItems.length > 0) {
            const geminiSections = await generateGeminiRecommendations(wardrobeItems, weather, gender);
            // Tag each section with source
            for (const s of geminiSections) {
                s.source = "ai";
                s.source_label = "Рекомендовано AI";
            }
            sections.push(...geminiSections);
        }

        // --- Generate CLIP recommendations (partner catalog + user wardrobe) ---
        const clipSections = await generateClipRecommendations(
            supabase, user.id, weather, gender,
        );
        for (const s of clipSections) {
            s.source = "clip";
            s.source_label = "Рекомендовано нашей моделью";
        }
        sections.push(...clipSections);

        // Enrich all items with image_url from DB
        if (sections.length > 0) {
            sections = await enrichSectionsWithImages(supabase, sections, user.id);
        }

        // A/B split: randomize order so CLIP/Gemini sections alternate
        // With CLIP_PROBABILITY controlling which appears first
        if (Math.random() < CLIP_PROBABILITY) {
            // CLIP sections first
            sections.sort((a: any, b: any) => {
                if (a.source === "clip" && b.source !== "clip") return -1;
                if (a.source !== "clip" && b.source === "clip") return 1;
                return 0;
            });
        }

        // Save to DB
        if (sections.length > 0) {
            const today = new Date().toISOString().slice(0, 10);
            const { data: updated, error: updateErr } = await supabase
                .from("main_recommendations")
                .update({ look_sections: sections })
                .eq("user_id", user.id)
                .eq("run_date", today)
                .select("user_id")
                .maybeSingle();

            if (!updated && !updateErr) {
                await supabase.from("main_recommendations").insert({
                    user_id: user.id,
                    run_date: today,
                    look_sections: sections,
                });
            }
        }

        const { sections: cleaned, stats } = filterSections(sections, 2);
        console.log("[Recs POST] Final:", cleaned.length, "sections. Stats:", JSON.stringify(stats));
        return NextResponse.json(cleaned);
    } catch (e: any) {
        console.error("[Recs POST] Error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Gemini recommendations — outfits from user's wardrobe
// ---------------------------------------------------------------------------

async function generateGeminiRecommendations(
    wardrobeItems: any[], weather: any, gender: string | null,
): Promise<any[]> {
    try {
        const wardrobeJson = JSON.stringify(wardrobeItems.map(i => ({
            id: i.id, name: i.item_name, color: i.color, shade: i.shade,
            style: i.style, material: i.material, type: i.clothing_type,
            has_print: i.has_print, image_url: i.image_url, user_id: i.user_id,
        })));

        const systemPrompt = `You are a fashion stylist AI. Generate outfit recommendations from the user's wardrobe.

RULES:
- Build outfits ONLY from items in the user's wardrobe (use exact item IDs).
- Create 2-3 thematic sections.
- Each section has 2-3 outfit suggestions with 3-5 items each.
- Consider the weather (temperature ${weather.temperature}°C, ${weather.description}).
- All text in Russian.

Response format (JSON array): [{"title":"section title","suggestions":[{"id":"unique","title":"outfit title","items":[{"id":num,"name":"","user_id":"","image_url":"","color":"","shade":null,"has_print":"no","notes":null,"url":null}],"suggested_items_count":N}]}]
Return ONLY valid JSON. No markdown.`;

        const result = await openrouterChat({
            model: "google/gemini-2.5-flash-lite",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Gender: ${gender || "не указан"}\nWeather: ${weather.location}, ${weather.temperature}°C, ${weather.description}\n\nWardrobe:\n${wardrobeJson}` },
            ],
            temperature: 0.8,
        });

        const content = result.choices?.[0]?.message?.content;
        if (!content) return [];

        const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : parsed.sections || [];
    } catch (e) {
        console.error("[Recs] Gemini failed:", e);
        return [];
    }
}

// ---------------------------------------------------------------------------
// CLIP recommendations — personalized from embeddings + partner catalog
// ---------------------------------------------------------------------------

async function generateClipRecommendations(
    supabase: any, userId: string, weather: any, gender: string | null,
): Promise<any[]> {
    try {
        // Call CLIP /recommend endpoint
        const recRes = await fetch(`${AI_SERVICE_URL}/clip/recommend`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, k: 30 }),
            signal: AbortSignal.timeout(15000),
        });

        if (!recRes.ok) {
            console.log("[Recs] CLIP service unavailable:", recRes.status);
            return [];
        }

        const recData = await recRes.json();
        let results: any[] = recData.results || [];

        if (results.length === 0) return [];

        // Filter by weather: temp_min/temp_max from wardrobe_items
        const temp = weather.temperature ?? 20;
        const ids = results.map((r: any) => r.id);

        const { data: itemDetails } = await supabase
            .from("wardrobe_items")
            .select("id, item_name, image_url, clothing_type, color, url, notes, gender, temp_min, temp_max")
            .in("id", ids);

        const detailMap = new Map<number, any>();
        for (const row of itemDetails || []) detailMap.set(row.id, row);

        // Filter: match weather and gender
        const filtered = results
            .map((r: any) => {
                const db = detailMap.get(r.id);
                if (!db) return null;
                // Weather filter: skip items outside temp range
                if (db.temp_min != null && temp < db.temp_min) return null;
                if (db.temp_max != null && temp > db.temp_max) return null;
                // Gender filter
                if (gender && db.gender && db.gender !== gender) return null;

                const brand = db.notes?.split(":")?.[0] || null;
                return {
                    id: r.id,
                    score: r.score,
                    name: db.item_name,
                    image_url: db.image_url,
                    clothing_type: db.clothing_type,
                    color: db.color,
                    url: db.url,
                    brand,
                };
            })
            .filter(Boolean)
            .slice(0, 15);

        if (filtered.length === 0) return [];

        // Group by clothing_type for display
        const byType = new Map<string, any[]>();
        for (const item of filtered) {
            const type = item.clothing_type || "other";
            if (!byType.has(type)) byType.set(type, []);
            byType.get(type)!.push(item);
        }

        // Build sections from partner items
        const suggestions = filtered.map((item: any, idx: number) => ({
            id: `clip_${item.id}`,
            title: item.name,
            items: [{
                id: item.id,
                name: item.name,
                image_url: item.image_url,
                color: item.color || "",
                url: item.url,
                brand: item.brand,
            }],
            suggested_items_count: 1,
        }));

        return [{
            title: "Подобрано по вашему стилю",
            suggestions: suggestions.slice(0, 6),
        }];
    } catch (e) {
        console.error("[Recs] CLIP failed:", e);
        return [];
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
