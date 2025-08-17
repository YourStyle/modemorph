// /api/credits/spend — НЕ вызываем use_feature, чтобы не было двойного инкремента.
// spend_credits сам спишет токены и начислит usage/бонусы по p_reason.
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

    const { amount, reason, description } = await request.json()
    if (!amount || !reason) {
      return NextResponse.json({ error: "Amount and reason are required" }, { status: 400 })
    }

    // Профиль (int id)
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Списание токенов + начисление usage/бонусов внутри БД
    // p_reason значения:
    //   'ideas_pack5' (2 токена → +5 к ideas_viewed_bonus_today)
    //   'ai_requests' (2 токена → +1 к ai_requests_today)
    //   'wardrobe_items'|'wardrobe_digitizations' (5 токенов → +1 к wardrobe_items_today)
    const { data: success, error: spendErr } = await supabase.rpc("spend_credits", {
      p_user_profile_id: profile.id,
      p_amount: amount,
      p_reason: reason,
      p_description: description,
    })
    if (spendErr) {
      return NextResponse.json({ error: spendErr.message }, { status: 400 })
    }
    if (!success) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 })
    }

    // Возвращаем обновлённый баланс
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits_balance")
      .eq("user_profile_id", profile.id)
      .single()

    return NextResponse.json({ success: true, newBalance: credits?.credits_balance || 0 })
  } catch (error) {
    console.error("Error spending credits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
