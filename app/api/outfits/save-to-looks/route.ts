import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { outfitId } = await request.json()

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
          position,
          wardrobe_item_id,
          wardrobe_items!wardrobe_item_id (
            id,
            is_basic
          )
        )
      `)
      .eq("id", outfitId)
      .single()

    if (outfitError || !outfit) {
      return NextResponse.json({ error: "Outfit not found" }, { status: 404 })
    }

    // Transform outfit items to user look format
    const lookItems = (outfit.outfit_items || [])
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .map((item: any) => {
        const wardrobeItem = item.wardrobe_items
        if (!wardrobeItem) return null

        return {
          id: wardrobeItem.id,
          type: "basic", // всегда basic как указал пользователь
        }
      })
      .filter(Boolean)

    // Create user look
    const { data: userLook, error: lookError } = await supabase
      .from("user_looks")
      .insert({
        user_id: user.id,
        name: outfit.name || "Сохраненный образ",
        description: outfit.description || "Образ из вдохновения",
        items: lookItems,
      })
      .select()
      .single()

    if (lookError) {
      console.error("Error saving look:", lookError)
      return NextResponse.json({ error: "Failed to save look" }, { status: 500 })
    }

    return NextResponse.json({ success: true, look: userLook })
  } catch (error) {
    console.error("Error in save-to-looks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
