import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { outfit_id } = await request.json()

    if (!outfit_id) {
      return NextResponse.json({ error: "Outfit ID is required" }, { status: 400 })
    }

    // Get user's primary avatar
    const { data: avatar, error: avatarError } = await supabase
      .from("user_avatars")
      .select("url")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .single()

    if (avatarError || !avatar) {
      return NextResponse.json(
        { error: "No primary avatar found. Please upload and set a primary avatar first." },
        { status: 400 },
      )
    }

    // Get outfit details with items
    const { data: outfit, error: outfitError } = await supabase
      .from("outfits")
      .select(`
        *,
        outfit_items (
          wardrobe_items (
            id,
            name,
            description,
            color,
            material,
            image_url
          )
        )
      `)
      .eq("id", outfit_id)
      .single()

    if (outfitError || !outfit) {
      return NextResponse.json({ error: "Outfit not found" }, { status: 404 })
    }

    // Prepare items data for VTON API
    const items = outfit.outfit_items.map((item: any) => ({
      name: item.wardrobe_items.name,
      description: item.wardrobe_items.description || "",
      color: item.wardrobe_items.color || "",
      material: item.wardrobe_items.material || "",
      image_url: item.wardrobe_items.image_url,
    }))

    // Call VTON API
    const vtonApiUrl = `${process.env.NEXT_PUBLIC_AI_API_URL}/vton`
    const vtonResponse = await fetch(vtonApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        avatar_url: avatar.url,
        items: items,
      }),
    })

    if (!vtonResponse.ok) {
      const errorText = await vtonResponse.text()
      console.error("VTON API error:", errorText)
      return NextResponse.json({ error: "Virtual try-on service is currently unavailable" }, { status: 503 })
    }

    const vtonResult = await vtonResponse.json()

    return NextResponse.json({
      success: true,
      result: vtonResult,
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
