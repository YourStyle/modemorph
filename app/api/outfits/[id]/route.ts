import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: "Outfit ID is required" }, { status: 400 })
    }

    console.log("Fetching outfit with ID:", id)

    // Получаем текущего пользователя
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("Error getting user:", userError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      console.log("No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Fetching outfit for user:", user.id)

    // Получаем образ с элементами - используем правильные названия колонок
    const { data: outfit, error } = await supabase
      .from("outfits")
      .select(`
        *,
        outfit_items (
          *,
          wardrobe_items (
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
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error) {
      console.error("Error fetching outfit:", error)

      // Check if outfit not found
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Outfit not found" }, { status: 404 })
      }

      return NextResponse.json({ error: `Failed to fetch outfit: ${error.message}` }, { status: 500 })
    }

    if (!outfit) {
      console.log("No outfit found with ID:", id)
      return NextResponse.json({ error: "Outfit not found" }, { status: 404 })
    }

    console.log("Fetched outfit:", outfit.name)
    console.log("Outfit items count:", outfit.outfit_items?.length || 0)

    return NextResponse.json({ outfit })
  } catch (error) {
    console.error("Error in outfit GET API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { name, description, season, occasion, items } = body

    if (!id || !name || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    // Получаем текущего пользователя
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("Error getting user:", userError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      console.error("Error updating outfit:", outfitError)
      return NextResponse.json({ error: `Failed to update outfit: ${outfitError.message}` }, { status: 500 })
    }

    // Удаляем старые элементы образа
    const { error: deleteError } = await supabase.from("outfit_items").delete().eq("outfit_id", id)

    if (deleteError) {
      console.error("Error deleting old outfit items:", deleteError)
      return NextResponse.json({ error: `Failed to update outfit items: ${deleteError.message}` }, { status: 500 })
    }

    // Добавляем новые элементы к образу
    const outfitItems = items.map((itemId: number, index: number) => ({
      outfit_id: Number.parseInt(id),
      wardrobe_item_id: itemId,
      position: index,
    }))

    const { error: itemsError } = await supabase.from("outfit_items").insert(outfitItems)

    if (itemsError) {
      console.error("Error adding new items to outfit:", itemsError)
      return NextResponse.json({ error: `Failed to add new items to outfit: ${itemsError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in outfit PUT API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: "Outfit ID is required" }, { status: 400 })
    }

    // Получаем текущего пользователя
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("Error getting user:", userError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Удаляем образ (элементы удалятся автоматически благодаря CASCADE)
    const { error } = await supabase.from("outfits").delete().eq("id", id).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting outfit:", error)
      return NextResponse.json({ error: `Failed to delete outfit: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in outfit DELETE API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
