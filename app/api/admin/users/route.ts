import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: isAdminResult, error: adminCheckError } = await supabase.rpc("is_user_admin", { user_uuid: user.id })

  if (adminCheckError) {
    console.error("Admin check error:", adminCheckError)
    return NextResponse.json({ error: "Admin check failed" }, { status: 500 })
  }

  if (!isAdminResult) {
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
