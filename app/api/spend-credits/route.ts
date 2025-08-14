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

    const { amount, reason, description, featureType } = await request.json()

    if (!amount || !reason) {
      return NextResponse.json({ error: "Amount and reason are required" }, { status: 400 })
    }

    const { data: profile } = await supabase.from("user_profiles").select("id").eq("user_id", user.id).single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (featureType) {
      const { data: canUse } = await supabase.rpc("use_feature", {
        p_user_profile_id: profile.id,
        p_feature_type: featureType,
      })

      if (!canUse) {
        return NextResponse.json({ error: "Daily limit exceeded" }, { status: 400 })
      }
    }

    const { data: success } = await supabase.rpc("spend_credits", {
      p_user_id: user.id, // Keep using auth user ID for credits
      p_amount: amount,
      p_reason: reason,
      p_description: description,
    })

    if (!success) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 })
    }

    // Get updated balance
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits_balance")
      .eq("user_profile_id", profile.id)
      .single()

    return NextResponse.json({
      success: true,
      newBalance: credits?.credits_balance || 0,
    })
  } catch (error) {
    console.error("Error spending credits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
