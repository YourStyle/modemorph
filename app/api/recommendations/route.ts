import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth-server";
import { filterSections } from "@/lib/recommendation-filters";

export const dynamic = "force-dynamic";

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
        const { sections, stats } = filterSections(raw, 2);

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

        const responseText = await response.text();
        let aiData: any;
        try {
            aiData = JSON.parse(responseText);
        } catch {
            console.error("[Recommendations POST] Invalid AI response:", responseText);
            return NextResponse.json({ error: "Invalid AI response" }, { status: 502 });
        }

        // Normalize: response can be array of sections or array of outfits
        const sections = Array.isArray(aiData) ? aiData : (aiData?.sections || aiData?.look_sections || []);

        if (sections.length === 0) {
            return NextResponse.json([]);
        }

        // Save to main_recommendations
        const now = new Date().toISOString();
        await supabase
            .from("main_recommendations")
            .upsert({
                user_id: user.id,
                run_date: now,
                look_sections: sections,
            }, { onConflict: "user_id" });

        console.log("[Recommendations POST] Saved recommendations for user:", user.id);

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
