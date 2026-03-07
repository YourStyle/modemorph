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
 * Calls the AI service /user-prompt-rec with a wardrobe-based prompt,
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

        const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app";
        const authToken = req.headers.get("authorization")?.replace("Bearer ", "");

        // Call AI service to generate recommendations
        console.log("[Recommendations POST] Triggering AI generation for user:", user.id);

        const response = await fetch(`${aiApiUrl}/user-prompt-rec`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authToken && { Authorization: `Bearer ${authToken}` }),
            },
            body: JSON.stringify({
                user_id: user.id,
                prompt: "Подбери мне несколько стильных образов из моего гардероба на разные случаи",
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error("[Recommendations POST] AI service error:", response.status, errorText);
            return NextResponse.json({ error: "AI service error" }, { status: 502 });
        }

        const responseText = await response.text();
        let aiData: any[];
        try {
            aiData = JSON.parse(responseText);
        } catch {
            console.error("[Recommendations POST] Invalid AI response:", responseText);
            return NextResponse.json({ error: "Invalid AI response" }, { status: 502 });
        }

        if (!Array.isArray(aiData) || aiData.length === 0) {
            return NextResponse.json([]);
        }

        // Transform AI response into look_sections format
        // The AI returns outfit objects with { id, title, description, items }
        const outfits = aiData.filter((item: any) => item?.id && item?.title && item?.items);

        if (outfits.length === 0) {
            return NextResponse.json([]);
        }

        const lookSections = [{
            title: "Рекомендации для вас",
            looks_count: outfits.length,
            suggestions: outfits.map((outfit: any) => ({
                id: String(outfit.id),
                title: outfit.title,
                items: Array.isArray(outfit.items) ? outfit.items.map((item: any) => ({
                    id: String(item.id),
                    name: item.name || "",
                    image_url: item.image_url || "",
                    color: item.color || "",
                    shade: item.shade || "",
                    has_print: item.has_print || "",
                    notes: item.notes || "",
                    user_id: item.user_id || null,
                })) : [],
                suggested_items_count: Array.isArray(outfit.items)
                    ? outfit.items.filter((i: any) => !i.user_id).length
                    : 0,
            })),
        }];

        // Save to main_recommendations
        const now = new Date().toISOString();
        await supabase
            .from("main_recommendations")
            .upsert({
                user_id: user.id,
                run_date: now,
                look_sections: lookSections,
            }, { onConflict: "user_id" });

        console.log("[Recommendations POST] Saved", outfits.length, "outfits for user:", user.id);

        const { sections } = filterSections(lookSections, 2);
        return NextResponse.json(sections);
    } catch (e: any) {
        console.error("[Recommendations POST] Error:", e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
