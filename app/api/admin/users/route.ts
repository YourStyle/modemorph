import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Используем service role для админских операций
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
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

  const { data: users, error } = await supabase
    .from("user_profiles")
    .select(`
      id,
      user_id,
      full_name,
      is_admin,
      created_at,
      updated_at,
      user_subscriptions (
        subscription_type,
        status,
        start_date,
        end_date,
        credits_included
      ),
      user_credits (
        credits_balance,
        updated_at
      ),
      daily_usage_limits (
        last_reset_date,
        wardrobe_items_today,
        ai_requests_today,
        ideas_viewed_today,
        outfits_saved_today
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const usersWithEmails = await Promise.all(
    users.map(async (userProfile) => {
      const { data: authUser } = await supabase.auth.admin.getUserById(userProfile.user_id)
      return {
        ...userProfile,
        email: authUser.user?.email || null,
      }
    }),
  )

  return NextResponse.json({ users: usersWithEmails })
}
