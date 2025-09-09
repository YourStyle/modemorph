import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { outfitId, lookName } = await request.json()

    if (!outfitId) {
      return NextResponse.json({ error: "Outfit ID is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get outfit with items
    const { data: outfit, error: outfitError } = await supabase
      .from("outfits")
      .select(`
        id,
        name,
        description,
        outfit_items (
          wardrobe_item_id,
          position,
          wardrobe_items (
            id,
            item_name,
            image_url,
            color,
            shade,
            style,
            material,
            is_basic,
            basic_item_id,
            notes
          )
        )
      `)
      .eq("id", outfitId)
      .single()

    if (outfitError || !outfit) {
      return NextResponse.json({ error: "Outfit not found" }, { status: 404 })
    }

    // Transform outfit items to user look format
    const lookItems =
      outfit.outfit_items?.map((item) => ({
        id: item.wardrobe_items?.id?.toString() || "",
        name: item.wardrobe_items?.item_name || "",
        image_url: item.wardrobe_items?.image_url || "",
        color: item.wardrobe_items?.color || "",
        shade: item.wardrobe_items?.shade || "",
        has_print: "нет",
        notes: item.wardrobe_items?.notes || "",
        user_id: item.wardrobe_items?.is_basic ? null : user.id,
        type: item.wardrobe_items?.is_basic ? "basic" : "user",
        basic_item_id: item.wardrobe_items?.basic_item_id,
      })) || []

    // Create user look
    const { data: userLook, error: lookError } = await supabase
      .from("user_looks")
      .insert({
        user_id: user.id,
        name: lookName || outfit.name || "Сохраненный образ",
        items: lookItems,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (lookError) {
      console.error("Error creating user look:", lookError)
      return NextResponse.json({ error: "Failed to save look" }, { status: 500 })
    }

    return NextResponse.json({ success: true, look: userLook })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
