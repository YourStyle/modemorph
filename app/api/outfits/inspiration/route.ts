import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Get outfits with their items
    const { data: outfits, error } = await supabase
      .from("outfits")
      .select(`
        id,
        name,
        description,
        season,
        occasion,
        likes,
        outfit_items (
          position,
          wardrobe_item_id,
          wardrobe_items!wardrobe_item_id (
            id,
            item_name,
            image_url,
            color,
            shade,
            style,
            material,
            size_type,
            has_print,
            has_details,
            notes,
            is_basic,
            basic_item_id,
            url
          )
        )
      `)
      .order("likes", { ascending: false })
      .limit(12)

    if (error) {
      console.error("Error fetching outfits:", error)
      return NextResponse.json({ error: "Failed to fetch outfits" }, { status: 500 })
    }

    // Transform data for frontend
    const transformedOutfits = (outfits || []).map((outfit: any) => {
      const items = (outfit.outfit_items || [])
        .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
        .map((item: any) => {
          const wardrobeItem = item.wardrobe_items
          if (!wardrobeItem) return null

          return {
            id: wardrobeItem.id.toString(),
            name: wardrobeItem.item_name || "Без названия",
            image_url: wardrobeItem.image_url || "",
            color: wardrobeItem.color || "",
            shade: wardrobeItem.shade || "",
            style: wardrobeItem.style || "",
            material: wardrobeItem.material || "",
            size_type: wardrobeItem.size_type || "",
            has_print: wardrobeItem.has_print || "",
            has_details: wardrobeItem.has_details || "",
            notes: wardrobeItem.notes || "",
            url: wardrobeItem.url || "",
            is_basic: wardrobeItem.is_basic || false,
            basic_item_id: wardrobeItem.basic_item_id || null,
            user_id: wardrobeItem.is_basic ? null : wardrobeItem.user_id,
          }
        })
        .filter(Boolean)

      const tags = [outfit.season, outfit.occasion].filter(Boolean)

      return {
        id: outfit.id.toString(),
        title: outfit.name || "Образ без названия",
        description: outfit.description || "Описание отсутствует",
        items,
        tags,
        likes: outfit.likes || 0,
        isLiked: false, // TODO: implement user likes tracking
      }
    })

    return NextResponse.json({ outfits: transformedOutfits })
  } catch (error) {
    console.error("Error in inspiration API:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
