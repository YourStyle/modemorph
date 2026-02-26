import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth-server";
import { filterSections } from "@/lib/recommendation-filters";

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
