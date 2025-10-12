import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    console.log("[Admin Users API] Starting request")

    const user = await getAuthUser(req)
    if (!user) {
      console.log("[Admin Users API] No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[Admin Users API] User authenticated:", user.id)

    // Используем service role для админских операций
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseUrl || !serviceKey) {
      console.error("[Admin Users API] Missing Supabase credentials")
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    console.log("[Admin Users API] Checking admin rights for user:", user.id)

    // Проверяем админские права
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single()

    if (profileError) {
      console.error("[Admin Users API] Profile check error:", profileError)
      return NextResponse.json({ error: `Profile check failed: ${profileError.message}` }, { status: 500 })
    }

    console.log("[Admin Users API] Profile data:", profile)

    if (!profile?.is_admin) {
      console.log("[Admin Users API] User is not admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    console.log("[Admin Users API] User is admin, fetching users...")

    // Получаем список пользователей
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
        limits (
          wardrobe_items_anlyzed,
          ai_requests,
          ideas_viewed,
          outfits_saved,
          vton_used
        )
      `)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Admin Users API] Database query error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[Admin Users API] Found users:", users?.length || 0)

    // Добавляем email для каждого пользователя
    const usersWithEmails = await Promise.all(
      users.map(async (userProfile) => {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(userProfile.user_id)
          return {
            ...userProfile,
            email: authUser.user?.email || null,
          }
        } catch (emailError) {
          console.error("[Admin Users API] Error fetching email for user:", userProfile.user_id, emailError)
          return {
            ...userProfile,
            email: null,
          }
        }
      }),
    )

    console.log("[Admin Users API] Successfully returning users")
    return NextResponse.json({ users: usersWithEmails })
  } catch (err: any) {
    console.error("[Admin Users API] Unexpected error:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
