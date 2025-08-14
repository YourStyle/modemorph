import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userProfile } = await supabase.from("user_profiles").select("id").eq("user_id", user.id).single()

    if (!userProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    const { action, type, packId } = await request.json()

    if (action === "subscribe") {
      const { data: existingSubscription } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_profile_id", userProfile.id)
        .single()

      if (existingSubscription) {
        return NextResponse.json({ error: "User already has subscription" }, { status: 400 })
      }

      const price = type === "monthly" ? 299 : 2490
      const startDate = new Date()
      const expiresAt = new Date()
      if (type === "monthly") {
        expiresAt.setMonth(expiresAt.getMonth() + 1)
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)
      }

      const { error: subscriptionError } = await supabase.from("user_subscriptions").insert({
        user_profile_id: userProfile.id,
        subscription_type: type,
        start_date: startDate.toISOString(),
        expires_at: expiresAt.toISOString(),
      })

      if (subscriptionError) {
        return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 })
      }

      await supabase.rpc("add_credits", {
        p_user_profile_id: userProfile.id,
        p_amount: 40,
        p_reason: "subscription",
        p_description: `Кредиты за подписку ${type === "monthly" ? "на месяц" : "на год"}`,
      })

      return NextResponse.json({ success: true, message: "Подписка успешно оформлена!" })
    }

    if (action === "buy_credits") {
      // Get credit pack
      const { data: pack } = await supabase.from("credit_packs").select("*").eq("id", packId).single()

      if (!pack) {
        return NextResponse.json({ error: "Credit pack not found" }, { status: 404 })
      }

      await supabase.rpc("add_credits", {
        p_user_profile_id: userProfile.id,
        p_amount: pack.credits,
        p_reason: "purchase",
        p_description: `Покупка пака "${pack.name}"`,
      })

      return NextResponse.json({ success: true, message: `Куплено ${pack.credits} кредитов!` })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error processing subscription request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
