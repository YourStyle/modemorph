import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const envUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook";
        const aiBaseUrl = envUrl.replace(/\/webhook\/?$/, "");
        const authToken = req.headers.get("authorization")?.replace("Bearer ", "");

        let aiRes: Response;
        const contentType = req.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            aiRes = await fetch(aiBaseUrl + "/clip/search", {
                method: "POST",
                headers: authToken ? { Authorization: "Bearer " + authToken } : {},
                body: formData,
                signal: AbortSignal.timeout(30000),
            });
        } else {
            const body = await req.json().catch(() => ({}));
            aiRes = await fetch(aiBaseUrl + "/clip/search", {
                method: "POST",
                headers: Object.assign(
                    { "Content-Type": "application/json" },
                    authToken ? { Authorization: "Bearer " + authToken } : {}
                ),
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000),
            });
        }

        if (!aiRes.ok) {
            const errText = await aiRes.text().catch(() => "");
            console.error("[clip/search] AI error:", aiRes.status, errText);
            return NextResponse.json({ error: "AI service error", results: [] }, { status: 502 });
        }

        const data = await aiRes.json();
        const rawResults: Array<{ id: number; score: number }> = data.results || data || [];

        if (rawResults.length === 0) return NextResponse.json({ results: [] });

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const ids = rawResults.map((r) => r.id);
        const [catalogRes, userRes] = await Promise.all([
            supabase.from("wardrobe_items").select("id, image_url, item_name, item_name_en, clothing_type, color").in("id", ids),
            supabase.from("wardrobe_user_items").select("id, image_url, item_name, clothing_type, color, user_id").in("id", ids).eq("user_id", user.id),
        ]);

        const catalogMap = new Map<number, any>();
        for (const row of catalogRes.data || []) catalogMap.set(row.id, row);
        const userMap = new Map<number, any>();
        for (const row of userRes.data || []) userMap.set(row.id, row);

        const enriched = rawResults
            .map((r) => {
                const db = userMap.get(r.id) || catalogMap.get(r.id);
                if (!db) return null;
                return { id: r.id, score: r.score, image_url: db.image_url, name: db.item_name || db.item_name_en || "", clothing_type: db.clothing_type, color: db.color, user_id: db.user_id ?? null };
            })
            .filter(Boolean);

        return NextResponse.json({ results: enriched });
    } catch (e: any) {
        console.error("[clip/search] Error:", e);
        return NextResponse.json({ error: "Internal server error", results: [] }, { status: 500 });
    }
}
