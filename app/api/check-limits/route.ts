// /api/limits/check — принимает featureType|usageType, учитывает бонусы
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    // нормализация имён параметров и синонимов
    const raw = String(body.featureType ?? body.usageType ?? "").toLowerCase();
    const featureType =
      raw === "ideas_views"
        ? "ideas_viewed"
        : raw === "digitize" || raw === "wardrobe_digitizations"
        ? "wardrobe_items"
        : raw;

    // профиль
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // сброс суточных лимитов (обнуляет *_bonus_today при необходимости)
    await supabase.rpc("reset_daily_limits_if_needed", { p_user_profile_id: profile.id });

    // активная подписка
    const nowIso = new Date().toISOString();
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id")
      .eq("user_profile_id", profile.id)
      .eq("status", "active")
      .lte("start_date", nowIso)
      .gte("end_date", nowIso)
      .maybeSingle();
    const hasSub = !!sub;

    // Получаем остатки и бонусы
    const { data: limits } = await supabase
      .from("daily_usage_limits")
      .select(`
        wardrobe_items_today, ai_requests_today, ideas_viewed_today, outfits_saved_today,
        wardrobe_items_bonus_today, ai_requests_bonus_today, ideas_viewed_bonus_today, outfits_saved_bonus_today
      `)
      .eq("user_profile_id", profile.id)
      .single();

    // Базовые лимиты в зависимости от подписки
    const baseLimits = {
      wardrobe_items: 5,
      ai_requests: hasSub ? 20 : 1,
      ideas_viewed: 10,
      outfits_saved: 999,
    } as const;

    // Считаем остаток: today + bonus
    const remainingCounts = {
      wardrobe_items:
        (limits?.wardrobe_items_today ?? 0) + (limits?.wardrobe_items_bonus_today ?? 0),
      ai_requests:
        (limits?.ai_requests_today ?? 0) + (limits?.ai_requests_bonus_today ?? 0),
      ideas_viewed:
        (limits?.ideas_viewed_today ?? 0) + (limits?.ideas_viewed_bonus_today ?? 0),
      outfits_saved:
        (limits?.outfits_saved_today ?? 0) + (limits?.outfits_saved_bonus_today ?? 0),
    };

    // Общий дневной лимит = базовый + бонус
    const totalLimits = {
      wardrobe_items:
        baseLimits.wardrobe_items + (limits?.wardrobe_items_bonus_today ?? 0),
      ai_requests:
        baseLimits.ai_requests + (limits?.ai_requests_bonus_today ?? 0),
      ideas_viewed:
        baseLimits.ideas_viewed + (limits?.ideas_viewed_bonus_today ?? 0),
      outfits_saved:
        baseLimits.outfits_saved + (limits?.outfits_saved_bonus_today ?? 0),
    };

    // Выбираем нужное
    const totalRemaining =
      featureType === "wardrobe_items"
        ? remainingCounts.wardrobe_items
        : featureType === "ai_requests"
        ? remainingCounts.ai_requests
        : featureType === "ideas_viewed"
        ? remainingCounts.ideas_viewed
        : featureType === "outfits_saved"
        ? remainingCounts.outfits_saved
        : 0;

    const dailyLimit =
      featureType === "wardrobe_items"
        ? totalLimits.wardrobe_items
        : featureType === "ai_requests"
        ? totalLimits.ai_requests
        : featureType === "ideas_viewed"
        ? totalLimits.ideas_viewed
        : featureType === "outfits_saved"
        ? totalLimits.outfits_saved
        : 0;

    const usedCount = dailyLimit - totalRemaining;
    const canUse = totalRemaining > 0;
    const remaining = Math.max(totalRemaining, 0);

    return NextResponse.json({ canUse, remaining, usedToday: usedCount, dailyLimit });
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
