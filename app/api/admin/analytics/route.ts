import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    console.log("[Admin Analytics API] Starting request")

    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const now = new Date()
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // ==================== SINGLE BATCH: ALL EVENTS ====================
    // Instead of 5 separate queries, fetch all relevant events in ONE query
    const { data: allUserEvents } = await supabase
      .from("user_events")
      .select("event_type, user_profile_id, event_data, created_at")

    const eventsByType = (type: string) =>
      allUserEvents?.filter((e) => e.event_type === type) || []

    // ==================== ONBOARDING METRICS ====================

    const onboardingMetrics = {
      users_with_first_item: new Set(eventsByType("first_item_added").map((e) => e.user_profile_id)).size,
      users_onboarding_complete: new Set(eventsByType("onboarding_complete").map((e) => e.user_profile_id)).size,
      users_wardrobe_30: new Set(eventsByType("wardrobe_30_percent").map((e) => e.user_profile_id)).size,
      users_wardrobe_50: new Set(eventsByType("wardrobe_50_percent").map((e) => e.user_profile_id)).size,
      users_wardrobe_100: new Set(eventsByType("wardrobe_100_percent").map((e) => e.user_profile_id)).size,
    }

    // ==================== AHA-MOMENT METRICS ====================

    const ahaMomentMetrics = {
      users_first_outfit: new Set(eventsByType("first_outfit_generated").map((e) => e.user_profile_id)).size,
      users_first_tryon: new Set(eventsByType("first_tryon_opened").map((e) => e.user_profile_id)).size,
      users_clicked_recommendation: new Set(eventsByType("recommendation_clicked").map((e) => e.user_profile_id)).size,
    }

    // ==================== VALUE DELIVERY METRICS ====================

    const outfitSavedEvents = eventsByType("outfit_saved")
    const valueMetrics = {
      total_outfits_saved: outfitSavedEvents.length,
      users_saved_outfits: new Set(outfitSavedEvents.map((e) => e.user_profile_id)).size,
      total_outfits_shared: eventsByType("outfit_shared").length,
      total_tasks_completed: eventsByType("session_task_completed").length,
    }

    const outfitSavesByUser: Record<number, number> = {}
    outfitSavedEvents.forEach((e) => {
      outfitSavesByUser[e.user_profile_id] = (outfitSavesByUser[e.user_profile_id] || 0) + 1
    })
    const repeatUsers = Object.values(outfitSavesByUser).filter((count) => count > 1).length
    const totalUsersWithOutfits = Object.keys(outfitSavesByUser).length
    const repeatTaskRate = totalUsersWithOutfits > 0 ? Math.round((repeatUsers / totalUsersWithOutfits) * 100) : 0

    // ==================== ENGAGEMENT METRICS ====================

    const aiEvents = eventsByType("ai_assistant_used")
    const engagementMetrics = {
      users_used_ai: new Set(aiEvents.map((e) => e.user_profile_id)).size,
      total_ai_sessions: aiEvents.length,
    }

    // ==================== RETENTION METRICS (BATCH) ====================

    const { data: allProfiles } = await supabase
      .from("user_profiles")
      .select("id, user_id, created_at")

    // Fetch ALL activity data in ONE query instead of 3N queries
    const { data: allActivity } = await supabase
      .from("daily_user_activity")
      .select("user_profile_id, activity_date")

    // Build lookup: profileId -> Set of activity dates
    const activityByUser = new Map<number, Set<string>>()
    allActivity?.forEach((a) => {
      if (!activityByUser.has(a.user_profile_id)) {
        activityByUser.set(a.user_profile_id, new Set())
      }
      activityByUser.get(a.user_profile_id)!.add(a.activity_date)
    })

    const d1RetentionUsers = new Set<number>()
    const d7RetentionUsers = new Set<number>()
    const d30RetentionUsers = new Set<number>()

    if (allProfiles) {
      for (const p of allProfiles) {
        const dates = activityByUser.get(p.id)
        if (!dates) continue
        const reg = new Date(p.created_at)
        const d1 = new Date(reg.getTime() + 86400000).toISOString().split("T")[0]
        const d7 = new Date(reg.getTime() + 7 * 86400000).toISOString().split("T")[0]
        const d30 = new Date(reg.getTime() + 30 * 86400000).toISOString().split("T")[0]
        if (dates.has(d1)) d1RetentionUsers.add(p.id)
        if (dates.has(d7)) d7RetentionUsers.add(p.id)
        if (dates.has(d30)) d30RetentionUsers.add(p.id)
      }
    }

    const totalUsers = allProfiles?.length || 0
    const retentionMetrics = {
      d1_retention: totalUsers > 0 ? Math.round((d1RetentionUsers.size / totalUsers) * 100) : 0,
      d7_retention: totalUsers > 0 ? Math.round((d7RetentionUsers.size / totalUsers) * 100) : 0,
      d30_retention: totalUsers > 0 ? Math.round((d30RetentionUsers.size / totalUsers) * 100) : 0,
      d1_users: d1RetentionUsers.size,
      d7_users: d7RetentionUsers.size,
      d30_users: d30RetentionUsers.size,
    }

    const outfitsPerActiveUser = totalUsersWithOutfits > 0
      ? Math.round((valueMetrics.total_outfits_saved / totalUsersWithOutfits) * 10) / 10
      : 0

    // ==================== MONETIZATION METRICS ====================

    const paywallEvents = eventsByType("paywall_shown")
    const conversionEvents = eventsByType("conversion_to_premium")
    const paywallShownCount = paywallEvents.length
    const conversionsCount = conversionEvents.length
    const conversionRate = paywallShownCount > 0 ? Math.round((conversionsCount / paywallShownCount) * 100) : 0

    const monetizationMetrics = {
      paywall_shown: paywallShownCount,
      conversions_to_premium: conversionsCount,
      conversion_rate: conversionRate,
      premium_users: new Set(conversionEvents.map((e) => e.user_profile_id)).size,
      premium_feature_uses: eventsByType("premium_feature_used").length,
    }

    // ==================== FUNNEL DATA ====================

    const funnelData = [
      { stage: "Регистрация", users: totalUsers },
      { stage: "Первая вещь", users: onboardingMetrics.users_with_first_item },
      { stage: "30% гардероба", users: onboardingMetrics.users_wardrobe_30 },
      { stage: "Первый образ", users: ahaMomentMetrics.users_first_outfit },
      { stage: "Сохранение образа", users: valueMetrics.users_saved_outfits },
      { stage: "Повторное использование", users: repeatUsers },
    ]

    // ==================== TIMELINE DATA ====================
    // Use already-fetched allUserEvents, filter by date in JS

    const timelineData: Record<string, Record<string, number>> = {}

    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split("T")[0]
      timelineData[dateStr] = {
        first_item_added: 0,
        first_outfit_generated: 0,
        outfit_saved: 0,
        ai_assistant_used: 0,
      }
    }

    const last30DaysIso = last30Days.toISOString()
    allUserEvents?.forEach((event) => {
      if (event.created_at < last30DaysIso) return
      const dateStr = event.created_at.split("T")[0]
      if (timelineData[dateStr] && event.event_type in timelineData[dateStr]) {
        timelineData[dateStr][event.event_type]++
      }
    })

    const timelineArray = Object.entries(timelineData).map(([date, events]) => ({
      date,
      ...events,
    }))

    console.log("[Admin Analytics API] Successfully calculated analytics")

    return NextResponse.json({
      onboarding: onboardingMetrics,
      ahaMoment: ahaMomentMetrics,
      value: {
        ...valueMetrics,
        repeat_task_rate: repeatTaskRate,
        outfits_per_active_user: outfitsPerActiveUser,
      },
      engagement: engagementMetrics,
      retention: retentionMetrics,
      monetization: monetizationMetrics,
      funnel: funnelData,
      timeline: timelineArray,
    })
  } catch (err: any) {
    console.error("[Admin Analytics API] Unexpected error:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
