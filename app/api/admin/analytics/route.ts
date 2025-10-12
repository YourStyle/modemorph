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

    // Используем service role для админских операций
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // Проверяем админские права
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const now = new Date()
    const today = now.toISOString().split("T")[0]
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last30DaysDate = last30Days.toISOString().split("T")[0]
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last7DaysDate = last7Days.toISOString().split("T")[0]

    // ==================== ONBOARDING METRICS ====================

    // Получаем события онбординга
    const { data: onboardingEvents } = await supabase
      .from("user_events")
      .select("event_type, user_profile_id, created_at")
      .in("event_type", [
        "first_item_added",
        "onboarding_complete",
        "wardrobe_30_percent",
        "wardrobe_50_percent",
        "wardrobe_100_percent",
      ])

    const onboardingMetrics = {
      users_with_first_item: new Set(onboardingEvents?.filter((e) => e.event_type === "first_item_added").map((e) => e.user_profile_id)).size,
      users_onboarding_complete: new Set(onboardingEvents?.filter((e) => e.event_type === "onboarding_complete").map((e) => e.user_profile_id)).size,
      users_wardrobe_30: new Set(onboardingEvents?.filter((e) => e.event_type === "wardrobe_30_percent").map((e) => e.user_profile_id)).size,
      users_wardrobe_50: new Set(onboardingEvents?.filter((e) => e.event_type === "wardrobe_50_percent").map((e) => e.user_profile_id)).size,
      users_wardrobe_100: new Set(onboardingEvents?.filter((e) => e.event_type === "wardrobe_100_percent").map((e) => e.user_profile_id)).size,
    }

    // ==================== AHA-MOMENT METRICS ====================

    const { data: ahaMomentEvents } = await supabase
      .from("user_events")
      .select("event_type, user_profile_id, created_at")
      .in("event_type", [
        "first_outfit_generated",
        "first_tryon_opened",
        "recommendation_clicked",
      ])

    const ahaMomentMetrics = {
      users_first_outfit: new Set(ahaMomentEvents?.filter((e) => e.event_type === "first_outfit_generated").map((e) => e.user_profile_id)).size,
      users_first_tryon: new Set(ahaMomentEvents?.filter((e) => e.event_type === "first_tryon_opened").map((e) => e.user_profile_id)).size,
      users_clicked_recommendation: new Set(ahaMomentEvents?.filter((e) => e.event_type === "recommendation_clicked").map((e) => e.user_profile_id)).size,
    }

    // ==================== VALUE DELIVERY METRICS ====================

    const { data: valueEvents } = await supabase
      .from("user_events")
      .select("event_type, user_profile_id, created_at")
      .in("event_type", ["outfit_saved", "outfit_shared", "session_task_completed"])

    const valueMetrics = {
      total_outfits_saved: valueEvents?.filter((e) => e.event_type === "outfit_saved").length || 0,
      users_saved_outfits: new Set(valueEvents?.filter((e) => e.event_type === "outfit_saved").map((e) => e.user_profile_id)).size,
      total_outfits_shared: valueEvents?.filter((e) => e.event_type === "outfit_shared").length || 0,
      total_tasks_completed: valueEvents?.filter((e) => e.event_type === "session_task_completed").length || 0,
    }

    // Repeat task rate - пользователи, которые сохраняли образы более 1 раза
    const outfitSavesByUser: Record<number, number> = {}
    valueEvents?.filter((e) => e.event_type === "outfit_saved").forEach((e) => {
      outfitSavesByUser[e.user_profile_id] = (outfitSavesByUser[e.user_profile_id] || 0) + 1
    })
    const repeatUsers = Object.values(outfitSavesByUser).filter((count) => count > 1).length
    const totalUsersWithOutfits = Object.keys(outfitSavesByUser).length
    const repeatTaskRate = totalUsersWithOutfits > 0 ? Math.round((repeatUsers / totalUsersWithOutfits) * 100) : 0

    // ==================== ENGAGEMENT METRICS ====================

    const { data: engagementEvents } = await supabase
      .from("user_events")
      .select("event_type, user_profile_id, created_at")
      .in("event_type", [
        "ai_assistant_used",
        "wardrobe_viewed",
        "inspiration_viewed",
      ])

    const engagementMetrics = {
      users_used_ai: new Set(engagementEvents?.filter((e) => e.event_type === "ai_assistant_used").map((e) => e.user_profile_id)).size,
      total_ai_sessions: engagementEvents?.filter((e) => e.event_type === "ai_assistant_used").length || 0,
    }

    // ==================== RETENTION METRICS ====================

    // Получаем всех пользователей и их даты регистрации
    const { data: allProfiles } = await supabase
      .from("user_profiles")
      .select("id, user_id, created_at")

    // D1 Retention - пользователи вернувшиеся на следующий день
    const d1RetentionUsers = new Set<number>()
    const d7RetentionUsers = new Set<number>()
    const d30RetentionUsers = new Set<number>()

    if (allProfiles) {
      for (const profile of allProfiles) {
        const registrationDate = new Date(profile.created_at)
        const d1Date = new Date(registrationDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        const d7Date = new Date(registrationDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        const d30Date = new Date(registrationDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

        // Проверяем активность на D1
        const { data: d1Activity } = await supabase
          .from("daily_user_activity")
          .select("id")
          .eq("user_profile_id", profile.id)
          .eq("activity_date", d1Date)
          .limit(1)

        if (d1Activity && d1Activity.length > 0) {
          d1RetentionUsers.add(profile.id)
        }

        // Проверяем активность на D7
        const { data: d7Activity } = await supabase
          .from("daily_user_activity")
          .select("id")
          .eq("user_profile_id", profile.id)
          .eq("activity_date", d7Date)
          .limit(1)

        if (d7Activity && d7Activity.length > 0) {
          d7RetentionUsers.add(profile.id)
        }

        // Проверяем активность на D30
        const { data: d30Activity } = await supabase
          .from("daily_user_activity")
          .select("id")
          .eq("user_profile_id", profile.id)
          .eq("activity_date", d30Date)
          .limit(1)

        if (d30Activity && d30Activity.length > 0) {
          d30RetentionUsers.add(profile.id)
        }
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

    // Среднее количество образов на активного пользователя
    const outfitsPerActiveUser = totalUsersWithOutfits > 0
      ? Math.round((valueMetrics.total_outfits_saved / totalUsersWithOutfits) * 10) / 10
      : 0

    // ==================== MONETIZATION METRICS ====================

    const { data: monetizationEvents } = await supabase
      .from("user_events")
      .select("event_type, user_profile_id, event_data, created_at")
      .in("event_type", [
        "paywall_shown",
        "conversion_to_premium",
        "premium_feature_used",
      ])

    const paywallShownCount = monetizationEvents?.filter((e) => e.event_type === "paywall_shown").length || 0
    const conversionsCount = monetizationEvents?.filter((e) => e.event_type === "conversion_to_premium").length || 0
    const conversionRate = paywallShownCount > 0 ? Math.round((conversionsCount / paywallShownCount) * 100) : 0

    const monetizationMetrics = {
      paywall_shown: paywallShownCount,
      conversions_to_premium: conversionsCount,
      conversion_rate: conversionRate,
      premium_users: new Set(monetizationEvents?.filter((e) => e.event_type === "conversion_to_premium").map((e) => e.user_profile_id)).size,
      premium_feature_uses: monetizationEvents?.filter((e) => e.event_type === "premium_feature_used").length || 0,
    }

    // ==================== FUNNEL DATA ====================

    // Воронка конверсии
    const funnelData = [
      { stage: "Регистрация", users: totalUsers },
      { stage: "Первая вещь", users: onboardingMetrics.users_with_first_item },
      { stage: "30% гардероба", users: onboardingMetrics.users_wardrobe_30 },
      { stage: "Первый образ", users: ahaMomentMetrics.users_first_outfit },
      { stage: "Сохранение образа", users: valueMetrics.users_saved_outfits },
      { stage: "Повторное использование", users: repeatUsers },
    ]

    // ==================== TIMELINE DATA ====================

    // Динамика ключевых событий за последние 30 дней
    const { data: allEvents } = await supabase
      .from("user_events")
      .select("event_type, created_at")
      .gte("created_at", last30Days.toISOString())

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

    allEvents?.forEach((event) => {
      const dateStr = event.created_at.split("T")[0]
      if (timelineData[dateStr]) {
        if (event.event_type in timelineData[dateStr]) {
          timelineData[dateStr][event.event_type]++
        }
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
