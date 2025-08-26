// POST /api/limits/use  { featureType | usageType }
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = createClient();

  // auth
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // нормализация ключа
  const body = (await req.json()) ?? {};
  const raw = String(body.featureType ?? body.usageType ?? "").toLowerCase();
  const feature: "ideas_viewed" | "ai_requests" | "wardrobe_items" | "outfits_saved" =
    raw === "ideas_views" || raw === "ideas_viewed" || raw === "ideas"
      ? "ideas_viewed"
      : raw === "ai_requests" || raw === "ai" || raw === "ai_assistant"
      ? "ai_requests"
      : raw === "digitize" || raw === "wardrobe_digitizations" || raw === "wardrobe_items"
      ? "wardrobe_items"
      : "outfits_saved";

  // профиль
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // попытка списания
  const { data: ok, error: rpcErr } = await supabase.rpc("use_feature", {
    p_user_profile_id: profile.id,
    p_feature_type: feature,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });

  // ok=false — недостаточно остатков
  if (!ok) return NextResponse.json({ success: false, canUse: false });

  // вернём актуальный остаток
  const { data: limits } = await supabase
    .from("daily_usage_limits")
    .select(
      "wardrobe_items_today, wardrobe_items_bonus_today, ai_requests_today, ai_requests_bonus_today, ideas_viewed_today, ideas_viewed_bonus_today, outfits_saved_today, outfits_saved_bonus_today",
    )
    .eq("user_profile_id", profile.id)
    .single();

  const remaining =
    feature === "ideas_viewed"
      ? (limits?.ideas_viewed_today ?? 0) + (limits?.ideas_viewed_bonus_today ?? 0)
      : feature === "ai_requests"
      ? (limits?.ai_requests_today ?? 0) + (limits?.ai_requests_bonus_today ?? 0)
      : feature === "wardrobe_items"
      ? (limits?.wardrobe_items_today ?? 0) + (limits?.wardrobe_items_bonus_today ?? 0)
      : (limits?.outfits_saved_today ?? 0) + (limits?.outfits_saved_bonus_today ?? 0);

  return NextResponse.json({ success: true, canUse: true, remaining });
}
