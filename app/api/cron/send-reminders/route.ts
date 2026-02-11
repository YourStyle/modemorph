import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegramMessage, interpolateTemplate } from "@/lib/telegram-bot"

const DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun..6=Sat

    // Fetch active reminders matching today
    const { data: reminders } = await supabase
      .from("reminder_configs")
      .select("*")
      .eq("is_active", true)

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ message: "No active reminders", sent: 0 })
    }

    // Filter reminders for today
    const todayReminders = reminders.filter((r) => {
      if (r.reminder_type === "daily") return true
      if (r.reminder_type === "day_of_week" && r.day_of_week === dayOfWeek) return true
      return false
    })

    if (todayReminders.length === 0) {
      return NextResponse.json({ message: "No reminders for today", sent: 0 })
    }

    // Get users with notifications enabled
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, full_name, notifications_enabled")
      .neq("notifications_enabled", false)

    // Get telegram IDs from auth users
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 10000 })
    const authUsers = authData?.users || []

    const telegramUsers = authUsers
      .filter((u) => u.user_metadata?.telegram_id)
      .map((u) => ({
        userId: u.id,
        telegramId: String(u.user_metadata.telegram_id),
        name: u.user_metadata?.full_name || u.user_metadata?.first_name || "",
      }))

    // Filter to only users with notifications enabled
    const enabledUserIds = new Set(profiles?.map((p) => p.user_id) || [])
    const eligibleUsers = telegramUsers.filter((u) => enabledUserIds.has(u.userId))

    let totalSent = 0
    let totalFailed = 0

    // Template variables
    const templateVars: Record<string, string> = {
      day: DAY_NAMES[dayOfWeek],
    }

    for (const reminder of todayReminders) {
      for (const user of eligibleUsers) {
        const personalVars = { ...templateVars, name: user.name || "друг" }
        const text = interpolateTemplate(reminder.message_template, personalVars)

        try {
          const result = await sendTelegramMessage(user.telegramId, text)
          if (result.ok) {
            totalSent++
          } else {
            totalFailed++
          }
        } catch {
          totalFailed++
        }

        // Rate limit: ~30 msg/sec
        await new Promise((resolve) => setTimeout(resolve, 35))
      }
    }

    return NextResponse.json({
      success: true,
      reminders_processed: todayReminders.length,
      sent: totalSent,
      failed: totalFailed,
    })
  } catch (error: any) {
    console.error("[Cron Send Reminders] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
