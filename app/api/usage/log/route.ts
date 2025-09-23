import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { createClient } from "@supabase/supabase-js";

type Feature = "wardrobe_items_anlyzed" | "ai_requests" | "ideas_viewed" | "outfits_saved" | "vton_used";
type Action = "click" | "attempt" | "purchase_sub" | "purchase_credits";

const FEATURE_KEYS: Record<string, Feature> = {
  // точные ключи
  wardrobe_items_anlyzed: "wardrobe_items_anlyzed",
  ai_requests: "ai_requests",
  ideas_viewed: "ideas_viewed",
  outfits_saved: "outfits_saved",
  vton_used: "vton_used",
  // синонимы → каноническое имя
  digitize: "wardrobe_items_anlyzed",
  wardrobe: "wardrobe_items_anlyzed",
  wardrobe_items: "wardrobe_items_anlyzed",
  wardrobe_items_analyzed: "wardrobe_items_anlyzed", // правильное написание → с опечаткой в колонке
  ai: "ai_requests",
  assistant: "ai_requests",
  ideas: "ideas_viewed",
  ideas_views: "ideas_viewed",
  looks: "outfits_saved",
  outfits: "outfits_saved",
  vton: "vton_used",
  tryon: "vton_used",
};

function normFeature(s: string | undefined | null): Feature | null {
  if (!s) return null;
  const v = s.toLowerCase();
  return FEATURE_KEYS[v] ?? null;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Используем service role для операций с базой
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json();
  const key = normFeature(body.feature);
  const action: Action = body.action;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await supabase.rpc("log_usage_event", {
    p_user_profile_id: profile.id,
    p_feature: key,
    p_action: action,
    p_count: Number(body.count ?? 1),
    p_page_path: body?.meta?.pagePath ?? null,
    p_item_id: body?.meta?.itemId ?? null,
    p_request_id: body?.meta?.requestId ?? null,
    p_metadata: body?.meta ?? {},
  });

  return NextResponse.json({ ok: true });
}
