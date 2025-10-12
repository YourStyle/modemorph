import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    console.log("[Admin Metrics API] Starting request")

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

    // Получаем метрики
    const now = new Date()
    const today = now.toISOString().split("T")[0]
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last30DaysDate = last30Days.toISOString().split("T")[0]

    // Общее количество пользователей
    const { count: totalUsers } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })

    // MAU - уникальные пользователи за последние 30 дней
    const { data: mauData } = await supabase
      .from("daily_user_activity")
      .select("user_profile_id")
      .gte("activity_date", last30DaysDate)
      .lte("activity_date", today)

    const mau = new Set(mauData?.map((row) => row.user_profile_id)).size

    // DAU - уникальные пользователи за сегодня
    const { data: dauData } = await supabase
      .from("daily_user_activity")
      .select("user_profile_id")
      .eq("activity_date", today)

    const dau = dauData?.length || 0

    // Активные подписки
    const { count: activeSubscriptions } = await supabase
      .from("user_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")

    // Получаем динамику регистраций по дням за последние 30 дней
    const { data: dailyRegistrations } = await supabase
      .from("user_profiles")
      .select("created_at")
      .gte("created_at", last30Days.toISOString())
      .order("created_at", { ascending: true })

    // Группируем по дням
    const registrationsByDay: Record<string, number> = {}
    dailyRegistrations?.forEach((user) => {
      const date = new Date(user.created_at).toISOString().split("T")[0]
      registrationsByDay[date] = (registrationsByDay[date] || 0) + 1
    })

    // Формируем массив для графика (последние 30 дней)
    const registrationsChart = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split("T")[0]
      registrationsChart.push({
        date: dateStr,
        count: registrationsByDay[dateStr] || 0,
      })
    }

    // Получаем активность пользователей из daily_user_activity
    const { data: dailyActivity } = await supabase
      .from("daily_user_activity")
      .select("activity_date, user_profile_id")
      .gte("activity_date", last30DaysDate)
      .lte("activity_date", today)
      .order("activity_date", { ascending: true })

    // Группируем активность по дням (считаем уникальных пользователей)
    const activityByDay: Record<string, Set<string>> = {}
    dailyActivity?.forEach((record) => {
      const dateStr = record.activity_date
      if (!activityByDay[dateStr]) {
        activityByDay[dateStr] = new Set()
      }
      activityByDay[dateStr].add(record.user_profile_id.toString())
    })

    // Формируем массив для графика активности
    const activityChart = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split("T")[0]
      activityChart.push({
        date: dateStr,
        count: activityByDay[dateStr]?.size || 0,
      })
    }

    // Получаем топ-5 самых активных пользователей за последние 30 дней из usage_events
    const { data: topUsers } = await supabase
      .from("usage_events")
      .select("user_profile_id, count")
      .gte("created_at", last30Days.toISOString())
      .order("count", { ascending: false })
      .limit(5)

    console.log("[Admin Metrics API] Successfully calculated metrics")

    return NextResponse.json({
      summary: {
        totalUsers: totalUsers || 0,
        mau: mau || 0,
        dau: dau || 0,
        activeSubscriptions: activeSubscriptions || 0,
      },
      charts: {
        registrations: registrationsChart,
        activity: activityChart,
      },
      topUsers: topUsers || [],
    })
  } catch (err: any) {
    console.error("[Admin Metrics API] Unexpected error:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
