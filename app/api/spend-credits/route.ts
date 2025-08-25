// /api/credits/spend — принимает reason=ideas_views|ai_requests|wardrobe_items, НЕ вызывает use_feature
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
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: { "X-Track-Unauthorized": "true" },
        },
      )
    }

    const { amount, reason, description } = await request.json()
    if (!amount || !reason) return NextResponse.json({ error: "Amount and reason are required" }, { status: 400 })

    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const { data: success, error: spendErr } = await supabase.rpc("spend_credits", {
      p_user_profile_id: profile.id,
      p_amount: amount,
      p_reason: String(reason).toLowerCase(), // 'ideas_views' | 'ai_requests' | 'wardrobe_items'
      p_description: description ?? null,
    })
    if (spendErr) return NextResponse.json({ error: spendErr.message }, { status: 400 })
    if (!success) return NextResponse.json({ error: "Insufficient credits" }, { status: 400 })

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits_balance")
      .eq("user_profile_id", profile.id)
      .single()

    return NextResponse.json({ success: true, newBalance: credits?.credits_balance ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
