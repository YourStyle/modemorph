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

    const { featureType } = await request.json()

    const { data: profile } = await supabase.from("user_profiles").select("id").eq("user_id", user.id).single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: limits } = await supabase
      .from("daily_usage_limits")
      .select("*")
      .eq("user_profile_id", profile.id)
      .single()

    if (!limits) {
      // Initialize limits if they don't exist
      await supabase.rpc("reset_daily_limits_if_needed", {
        p_user_profile_id: profile.id,
      })

      return NextResponse.json({ canUse: true })
    }

    let canUse = false
    switch (featureType) {
      case "wardrobe_items":
        canUse = limits.wardrobe_items_today > 0
        break
      case "ai_requests":
        canUse = limits.ai_requests_today > 0
        break
      case "ideas_viewed":
        canUse = limits.ideas_viewed_today > 0
        break
      case "outfits_saved":
        canUse = limits.outfits_saved_today > 0
        break
      default:
        canUse = false
    }

    return NextResponse.json({ canUse, remainingUses: limits })
  } catch (error) {
    console.error("Error checking limits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
