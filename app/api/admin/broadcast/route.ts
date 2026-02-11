import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import { broadcastMessages } from "@/lib/telegram-bot"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // List past broadcasts
  const { data: broadcasts, error } = await supabase
    .from("broadcast_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ broadcasts })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, is_admin")
    .eq("user_id", user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { message, filter } = await req.json()

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }

  try {
    // Get all profiles with notification preferences
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, notifications_enabled")

    // Get all auth users to access telegram_id from metadata
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 10000 })
    const authUsers = authData?.users || []

    // Build user map: user_id -> { telegramId, notificationsEnabled }
    const profileMap = new Map<string, boolean>()
    profiles?.forEach((p) => {
      profileMap.set(p.user_id, p.notifications_enabled !== false) // default true
    })

    // Get subscription data for filtering
    let subscriberUserIds: Set<number> | null = null
    if (filter?.type === "subscribers" || filter?.type === "free") {
      const { data: subs } = await supabase
        .from("user_subscriptions")
        .select("user_profile_id")
        .eq("status", "active")
      subscriberUserIds = new Set(subs?.map((s) => s.user_profile_id) || [])
    }

    // Get profile ids for subscription filtering
    const { data: allProfiles } = (subscriberUserIds !== null)
      ? await supabase.from("user_profiles").select("id, user_id")
      : { data: null }

    const profileIdMap = new Map<string, number>()
    allProfiles?.forEach((p) => { profileIdMap.set(p.user_id, p.id) })

    // Build recipient list
    const recipients: Array<{ telegramId: string }> = []

    for (const authUser of authUsers) {
      const telegramId = authUser.user_metadata?.telegram_id
      if (!telegramId) continue

      // Respect notifications preference
      if (!profileMap.get(authUser.id)) continue

      // Apply filter
      if (filter?.type === "subscribers" && subscriberUserIds) {
        const pid = profileIdMap.get(authUser.id)
        if (!pid || !subscriberUserIds.has(pid)) continue
      }
      if (filter?.type === "free" && subscriberUserIds) {
        const pid = profileIdMap.get(authUser.id)
        if (pid && subscriberUserIds.has(pid)) continue
      }

      recipients.push({ telegramId: String(telegramId) })
    }

    // Send broadcast
    const result = await broadcastMessages(recipients, message)

    // Log to database
    await supabase.from("broadcast_messages").insert({
      admin_user_id: user.id,
      message_text: message,
      recipient_filter: filter || { type: "all" },
      total_sent: result.sent,
      total_failed: result.failed,
    })

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      total_recipients: recipients.length,
    })
  } catch (error: any) {
    console.error("[Broadcast API] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
