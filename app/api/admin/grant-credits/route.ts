import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if user is admin
  const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId, credits, subscriptionType, subscriptionDuration } = await request.json()

  try {
    // Grant credits if specified
    if (credits && credits > 0) {
      const { error: creditsError } = await supabase.rpc("add_user_credits", {
        target_user_id: userId,
        credits_to_add: credits,
        transaction_type: "admin_grant",
        description: `Admin granted ${credits} credits`,
      })

      if (creditsError) throw creditsError
    }

    // Grant subscription if specified
    if (subscriptionType && subscriptionDuration) {
      const startDate = new Date()
      const endDate = new Date()

      if (subscriptionDuration === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1)
      } else if (subscriptionDuration === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1)
      }

      const { error: subError } = await supabase.from("user_subscriptions").upsert({
        user_id: userId,
        subscription_type: subscriptionType,
        status: "active",
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        credits_included: subscriptionType === "pro" ? 40 : 0,
      })

      if (subError) throw subError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
