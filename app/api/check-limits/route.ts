// /api/limits/check
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();

  // auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // нормализация ключей
  const raw = String(body.featureType ?? body.usageType ?? "").toLowerCase();

  // ключ для таблицы лимитов
  const limitKey: "wardrobe_items" | "ai_requests" | "ideas_viewed" | "outfits_saved" =
    raw === "ideas_views" || raw === "ideas_viewed" || raw === "ideas" ? "ideas_viewed"
    : raw === "ai_requests" || raw === "ai" || raw === "ai_assistant" ? "ai_requests"
    : raw === "digitize" || raw === "wardrobe_digitizations" || raw === "wardrobe_items" ? "wardrobe_items"
    : raw === "outfits_saved" || raw === "outfit_creation" ? "outfits_saved"
    : "ideas_viewed";

  // ключ для feature_costs
  const featureKeyForCosts =
    limitKey === "ideas_viewed"   ? "ideas_viewing" :
    limitKey === "ai_requests"    ? "ai_assistant" :
    limitKey === "wardrobe_items" ? "wardrobe_digitization" :
    limitKey === "outfits_saved"  ? "outfit_creation" :
                                    "ideas_viewing";

  // профиль
  const { data: profile, error: profErr } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // сброс лимитов по дню
  await supabase.rpc("reset_daily_limits_if_needed", { p_user_profile_id: profile.id });

  // подписка
  const nowIso = new Date().toISOString();
  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_profile_id", profile.id)
    .eq("status", "active")
    .lte("start_date", nowIso)
    .gte("expires_at", nowIso)
    .maybeSingle();
  const hasSubscription = !!sub;

  // остатки
  const { data: limits } = await supabase
    .from("daily_usage_limits")
    .select(`
      wardrobe_items_today, ai_requests_today, ideas_viewed_today, outfits_saved_today,
      wardrobe_items_bonus_today, ai_requests_bonus_today, ideas_viewed_bonus_today, outfits_saved_bonus_today
    `)
    .eq("user_profile_id", profile.id)
    .single();

  const remaining =
    limitKey === "ideas_viewed"
      ? (limits?.ideas_viewed_today ?? 0) + (limits?.ideas_viewed_bonus_today ?? 0)
      : limitKey === "ai_requests"
      ? (limits?.ai_requests_today ?? 0) + (limits?.ai_requests_bonus_today ?? 0)
      : limitKey === "wardrobe_items"
      ? (limits?.wardrobe_items_today ?? 0) + (limits?.wardrobe_items_bonus_today ?? 0)
      : (limits?.outfits_saved_today ?? 0) + (limits?.outfits_saved_bonus_today ?? 0);

  // стоимость фичи (0 => разрешить даже при нуле)
  const { data: featureCost } = await supabase.rpc("get_feature_cost", {
    p_user_profile_id: profile.id,
    p_feature_key: featureKeyForCosts,
  });

  const canUse = (remaining > 0) || ((featureCost ?? 0) === 0);

  return NextResponse.json({
    canUse,
    remaining: Math.max(remaining, 0),
    featureCost: featureCost ?? 0,
    hasSubscription,
    feature: limitKey,
  });
}
