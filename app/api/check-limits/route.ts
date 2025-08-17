// /api/limits/check  — учитывает бонусы; без лишних полей (expires_at удалён)
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { featureType } = await request.json()

    // Профиль (int id)
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Сброс дневных счётчиков (RPC должен также обнулять *_bonus_today)
    await supabase.rpc("reset_daily_limits_if_needed", { p_user_profile_id: profile.id })

    // Активная подписка (expires_at удалён → проверяем end_date)
    const nowIso = new Date().toISOString()
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, status, start_date, end_date")
      .eq("user_profile_id", profile.id)
      .eq("status", "active")
      .lte("start_date", nowIso)
      .gte("end_date", nowIso)
      .maybeSingle()

    const hasSub = !!sub

    // Текущие дневные счётчики + бонусы
    const { data: limits } = await supabase
      .from("daily_usage_limits")
      .select(
        "wardrobe_items_today, ai_requests_today, ideas_viewed_today, outfits_saved_today, " +
        "wardrobe_items_bonus_today, ai_requests_bonus_today, ideas_viewed_bonus_today"
      )
      .eq("user_profile_id", profile.id)
      .single()

    const used = {
      wardrobe_items: limits?.wardrobe_items_today ?? 0,
      ai_requests:    limits?.ai_requests_today    ?? 0,
      ideas_viewed:   limits?.ideas_viewed_today   ?? 0,
      outfits_saved:  limits?.outfits_saved_today  ?? 0,
    }
    const bonus = {
      wardrobe_items: limits?.wardrobe_items_bonus_today ?? 0,
      ai_requests:    limits?.ai_requests_bonus_today    ?? 0,
      ideas_viewed:   limits?.ideas_viewed_bonus_today   ?? 0,
    }

    // Базовые квоты
    const base = {
      wardrobe_items: 5,
      ai_requests: hasSub ? 20 : 1,
      ideas_viewed: 10,
      outfits_saved: 999,
    } as const

    // Суммарный лимит = базовый + бонус (для соответствующих фич)
    const limitFor = (ft: string) => {
      switch (ft) {
        case "wardrobe_items": return base.wardrobe_items + bonus.wardrobe_items
        case "ai_requests":    return base.ai_requests    + bonus.ai_requests
        case "ideas_viewed":   return base.ideas_viewed   + bonus.ideas_viewed
        case "outfits_saved":  return base.outfits_saved
        default:               return 0
      }
    }
    const usedFor = (ft: string) => {
      switch (ft) {
        case "wardrobe_items": return used.wardrobe_items
        case "ai_requests":    return used.ai_requests
        case "ideas_viewed":   return used.ideas_viewed
        case "outfits_saved":  return used.outfits_saved
        default:               return 0
      }
    }

    const L = limitFor(featureType)
    const u = usedFor(featureType)
    const canUse = u < L
    const remaining = Math.max(L - u, 0)

    return NextResponse.json({ canUse, remaining, usedToday: u, dailyLimit: L })
  } catch (error) {
    console.error("Error checking limits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
