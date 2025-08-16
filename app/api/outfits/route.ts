import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, season, occasion, items, preview_image_url, preview_url } = body

    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    const processedItems = items.map((item, index) => {
      // If item is just a number, convert it to the expected format
      if (typeof item === "number") {
        return {
          wardrobe_item_id: item,
          position: index + 1,
        }
      }
      // If item is an object, use existing logic
      return {
        wardrobe_item_id: item.wardrobe_item_id || item.id,
        position: item.position || index + 1,
      }
    })

    // Validate that all items have valid wardrobe_item_id
    const invalidItems = processedItems.filter(
      (item) => !item.wardrobe_item_id || typeof item.wardrobe_item_id !== "number",
    )
    if (invalidItems.length > 0) {
      console.error("Invalid wardrobe_item_id values:", invalidItems)
      return NextResponse.json(
        {
          error: "Invalid wardrobe item IDs provided",
          details: invalidItems,
        },
        { status: 400 },
      )
    }

    // Получаем текущего пользователя
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    // Создаем образ
    const outfitData = {
      name: name.toString(),
      description: description ? description.toString() : null,
      user_id: user.id,
      season: season ? season.toString() : null,
      occasion: occasion ? occasion.toString() : null,
      preview_image_url: preview_image_url || preview_url || null,
      likes: 0,
      favorites_count: 0,
      views_count: 0,
    }

    const { data: outfit, error: outfitError } = await supabase.from("outfits").insert(outfitData).select()

    if (outfitError || !outfit || outfit.length === 0) {
      return NextResponse.json(
        { error: `Failed to create outfit: ${outfitError?.message || "No data returned"}` },
        { status: 500 },
      )
    }

    const createdOutfit = outfit[0]

    const outfitItems = processedItems.map((item) => ({
      outfit_id: createdOutfit.id,
      wardrobe_item_id: item.wardrobe_item_id,
      position: item.position,
    }))

    console.log("Creating outfit items:", outfitItems)

    if (outfitItems.length === 0) {
      return NextResponse.json({ error: "No valid wardrobe items to add to outfit" }, { status: 400 })
    }

    const { error: itemsError } = await supabase.from("outfit_items").insert(outfitItems)

    if (itemsError) {
      console.error("Database error inserting outfit items:", itemsError)
      return NextResponse.json({ error: `Failed to add items to outfit: ${itemsError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, outfit: createdOutfit })
  } catch (error) {
    console.error("Error in outfits API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    const { data: outfits, error } = await supabase
      .from("outfits")
      .select(`
        *,
        outfit_items (
          *,
          wardrobe_items!wardrobe_item_id (
            id,
            item_name,
            size_type,
            color,
            shade,
            material,
            style,
            image_url,
            is_basic,
            has_print,
            has_details,
            notes
          )
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: `Failed to fetch outfits: ${error.message}` }, { status: 500 })
    }

    const enrichedOutfits = await Promise.all(
      (outfits || []).map(async (outfit) => {
        const { count: likesCount } = await supabase
          .from("user_likes")
          .select("*", { count: "exact", head: true })
          .eq("outfit_id", outfit.id)

        return {
          ...outfit,
          likes_count: likesCount || 0,
        }
      }),
    )

    return NextResponse.json({ outfits: enrichedOutfits })
  } catch (error) {
    console.error("Error in outfits GET API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, description, season, occasion, items } = body

    if (!id || !name || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    // Обновляем образ
    const { error: outfitError } = await supabase
      .from("outfits")
      .update({
        name,
        description: description || null,
        season: season || null,
        occasion: occasion || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)

    if (outfitError) {
      return NextResponse.json({ error: `Failed to update outfit: ${outfitError.message}` }, { status: 500 })
    }

    // Удаляем старые элементы образа
    const { error: deleteError } = await supabase.from("outfit_items").delete().eq("outfit_id", id)

    if (deleteError) {
      return NextResponse.json({ error: `Failed to update outfit items: ${deleteError.message}` }, { status: 500 })
    }

    // Добавляем новые элементы к образу - исправляем формат данных
    const outfitItems = items.map((item: any, index: number) => ({
      outfit_id: id,
      wardrobe_item_id: item.wardrobe_item_id || item.id, // Поддерживаем оба формата
      position: item.position || index + 1,
    }))

    const { error: itemsError } = await supabase.from("outfit_items").insert(outfitItems)

    if (itemsError) {
      return NextResponse.json({ error: `Failed to add new items to outfit: ${itemsError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in outfits PUT API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Outfit ID is required" }, { status: 400 })
    }

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    // Удаляем образ (элементы удалятся автоматически благодаря CASCADE)
    const { error } = await supabase.from("outfits").delete().eq("id", id).eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: `Failed to delete outfit: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in outfits DELETE API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
