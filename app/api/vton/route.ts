import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { outfit_id, items } = await request.json()

    // Get user's primary avatar
    const { data: primaryAvatar, error: avatarError } = await supabase
      .from("user_avatars")
      .select("avatar_url")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .single()

    if (avatarError || !primaryAvatar) {
      return NextResponse.json(
        { error: "No primary avatar found. Please upload and set a primary avatar first." },
        { status: 400 },
      )
    }

    // Prepare VTON request
    const vtonPayload = {
      avatar_url: primaryAvatar.avatar_url,
      items: items.map((item: any) => ({
        name: item.name || "Clothing item",
        description: item.description || item.style_description || "",
        color: item.color || "Unknown",
        material: item.material || "Unknown",
        image_url: item.image_url,
      })),
    }

    // Make request to VTON service
    const vtonUrl = `${process.env.NEXT_PUBLIC_AI_API_URL}/vton`
    const vtonResponse = await fetch(vtonUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vtonPayload),
    })

    if (!vtonResponse.ok) {
      const errorText = await vtonResponse.text()
      console.error("VTON service error:", errorText)
      return NextResponse.json({ error: "Virtual try-on service is currently unavailable" }, { status: 503 })
    }

    const vtonResult = await vtonResponse.json()

    return NextResponse.json({
      success: true,
      result: vtonResult,
      avatar_url: primaryAvatar.avatar_url,
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
