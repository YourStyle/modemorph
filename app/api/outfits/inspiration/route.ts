import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createClient()

    // Get outfits with their items and wardrobe item details
    const { data: outfits, error } = await supabase
      .from("outfits")
      .select(`
        id,
        name,
        description,
        season,
        occasion,
        created_at,
        outfit_items (
          id,
          position,
          wardrobe_item_id,
          wardrobe_items (
            id,
            item_name,
            image_url,
            color,
            shade,
            style,
            material,
            is_basic,
            basic_item_id
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: "Failed to fetch outfits" }, { status: 500 })
    }

    // Transform data for frontend
    const transformedOutfits =
      outfits?.map((outfit) => {
        const items =
          outfit.outfit_items
            ?.sort((a, b) => (a.position || 0) - (b.position || 0))
            .map((item) => ({
              id: item.wardrobe_items?.id?.toString() || "",
              name: item.wardrobe_items?.item_name || "",
              image_url: item.wardrobe_items?.image_url || "",
              color: item.wardrobe_items?.color || "",
              shade: item.wardrobe_items?.shade || "",
              style: item.wardrobe_items?.style || "",
              material: item.wardrobe_items?.material || "",
              is_basic: item.wardrobe_items?.is_basic || false,
              basic_item_id: item.wardrobe_items?.basic_item_id,
            })) || []

        // Generate tags from outfit metadata
        const tags = [outfit.season, outfit.occasion, ...items.map((item) => item.color).filter(Boolean)].filter(
          Boolean,
        )

        return {
          id: outfit.id.toString(),
          title: outfit.name || "Без названия",
          description: outfit.description || "",
          items,
          tags,
          likes: Math.floor(Math.random() * 100) + 10, // Random likes for demo
          isLiked: false,
        }
      }) || []

    return NextResponse.json(transformedOutfits)
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
