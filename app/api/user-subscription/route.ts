import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

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

    const { data: userProfile } = await supabase.from("user_profiles").select("id").eq("user_id", user.id).single()

    if (!userProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    const { data: subscription } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_profile_id", userProfile.id)
      .single()

    const { data: credits } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_profile_id", userProfile.id)
      .single()

    // Get credit packs
    const { data: creditPacks } = await supabase
      .from("credit_packs")
      .select("*")
      .eq("is_active", true)
      .order("price_rub")

    return NextResponse.json({
      subscription: subscription || null,
      credits: credits || { credits_balance: 0 },
      creditPacks: creditPacks || [],
    })
  } catch (error) {
    console.error("Error fetching subscription data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userProfile, error: upErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (upErr || !userProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    const { action, type, packId } = await request.json()

    if (action === "subscribe") {
      // Проверяем, нет ли активной подписки
      const { data: existingSubscription } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_profile_id", userProfile.id)
        .eq("status", "active")
        .maybeSingle()

      if (existingSubscription) {
        return NextResponse.json({ error: "User already has subscription" }, { status: 400 })
      }

      // Даты
      const startDate = new Date()
      const expireAt = new Date()
      if (type === "monthly") {
        expireAt.setMonth(expireAt.getMonth() + 1)
      } else {
        expireAt.setFullYear(expireAt.getFullYear() + 1)
      }

      // ВАЖНО: используем правильное имя колонки expire_at (без s) и сразу ставим статус
      const { error: subscriptionError } = await supabase
        .from("user_subscriptions")
        .insert({
          user_profile_id: userProfile.id,
          subscription_type: type,          // "monthly" | "yearly"
          status: "active",                 // если NOT NULL
          start_date: startDate.toISOString(),
          expires_at: expireAt.toISOString() // <-- правильная колонка из схемы
        })

      if (subscriptionError) {
        // временно логируем текст ошибки для диагностики RLS/NOT NULL/типов
        console.error("subscriptionError:", subscriptionError)
        return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 })
      }

      // Начисляем кредиты
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        const { error: actErr } = await supabase.rpc("activate_subscription_and_reset_limits", {
          p_user_profile_id: profile.id,
        });
        if (actErr) return NextResponse.json({ error: actErr.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: "Подписка успешно оформлена!" })
    }

    if (action === "buy_credits") {
      const { data: pack, error: packErr } = await supabase
        .from("credit_packs")
        .select("*")
        .eq("id", packId)
        .single()

      if (packErr || !pack) {
        return NextResponse.json({ error: "Credit pack not found" }, { status: 404 })
      }

      const { error: addErr } = await supabase.rpc("add_credits", {
        p_user_profile_id: userProfile.id,
        p_amount: pack.credits,
        p_reason: "purchase",
        p_description: `Покупка пака "${pack.name}"`,
      });
      if (addErr) {
        return NextResponse.json({ error: addErr.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: `Куплено ${pack.credits} кредитов!` })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error processing subscription request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
