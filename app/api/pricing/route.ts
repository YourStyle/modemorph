import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch subscription pricing
    const { data: subscriptions, error: subError } = await supabase
      .from("subscription_pricing")
      .select("*")
      .eq("is_active", true)
      .order("plan_type")

    if (subError) throw subError

    // Fetch credit packs
    const { data: creditPacks, error: packError } = await supabase
      .from("credit_packs")
      .select("*")
      .eq("is_active", true)
      .order("credits")

    if (packError) throw packError

    return NextResponse.json({
      subscriptions: subscriptions || [],
      creditPacks: creditPacks || [],
    })
  } catch (error) {
    console.error("Error fetching pricing:", error)
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    )
  }
}
