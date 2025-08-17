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

    // profile.id (int)
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // сброс дневных счётчиков при смене дня (если у тебя есть такая RPC)
    await supabase.rpc("reset_daily_limits_if_needed", { p_user_profile_id: profile.id })

    // активная подписка
    const nowIso = new Date().toISOString()
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, status, start_date, end_date, expires_at")
      .eq("user_profile_id", profile.id)
      .eq("status", "active")
      .lte("start_date", nowIso)
      // работаем с тем, что у тебя в схеме: берём coalesce(end_date, expires_at) >= now
      .gte("end_date", nowIso)
      .maybeSingle()

    const hasSub = !!sub

    // берём текущие дневные счётчики
    const { data: limits } = await supabase
      .from("daily_usage_limits")
      .select("wardrobe_items_today, ai_requests_today, ideas_viewed_today, outfits_saved_today, last_reset_date")
      .eq("user_profile_id", profile.id)
      .single()

    // если строки нет — считаем всё по нулям
    const used = {
      wardrobe_items: limits?.wardrobe_items_today ?? 0,
      ai_requests: limits?.ai_requests_today ?? 0,
      ideas_viewed: limits?.ideas_viewed_today ?? 0,
      outfits_saved: limits?.outfits_saved_today ?? 0,
    }

    // квоты на день
    const quota = {
      wardrobe_items: 5,
      ai_requests: hasSub ? 20 : 1,
      ideas_viewed: 10,
      outfits_saved: 999, // по сути «безлимит», но оставим большое число
    } as const

    // выбранный счётчик/лимит
    const pick = (ft: string) => {
      switch (ft) {
        case "wardrobe_items": return { used: used.wardrobe_items, limit: quota.wardrobe_items }
        case "ai_requests":    return { used: used.ai_requests,    limit: quota.ai_requests }
        case "ideas_viewed":   return { used: used.ideas_viewed,   limit: quota.ideas_viewed }
        case "outfits_saved":  return { used: used.outfits_saved,  limit: quota.outfits_saved }
        default:               return { used: 0, limit: 0 }
      }
    }

    const { used: u, limit: L } = pick(featureType)
    const canUse = u < L
    const remaining = Math.max(L - u, 0)

    return NextResponse.json({
      canUse,
      remaining,
      usedToday: u,
      dailyLimit: L,
    })
  } catch (error) {
    console.error("Error checking limits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
