import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("Request body:", body)

    const { name, description, season, occasion, items } = body

    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      console.log("Invalid request data:", { name, items })
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    // Получаем текущего пользователя
    const supabase = createClient()

    console.log("Getting user...")
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("Error getting user:", userError)
      return NextResponse.json({ error: "Authentication error: " + JSON.stringify(userError) }, { status: 401 })
    }

    if (!user) {
      console.log("No user found")
      return NextResponse.json({ error: "Unauthorized - no user" }, { status: 401 })
    }

    console.log("User found:", user.id)

    // Проверяем, существует ли таблица outfits
    console.log("Checking if outfits table exists...")
    const { data: tableCheck, error: tableError } = await supabase
      .from("outfits")
      .select("count", { count: "exact", head: true })

    if (tableError) {
      console.error("Table check error:", tableError)
      return NextResponse.json(
        {
          error: "Database table error: " + JSON.stringify(tableError),
        },
        { status: 500 },
      )
    }

    console.log("Table exists, creating outfit...")

    // Создаем образ
    const outfitData = {
      name: name.toString(),
      description: description ? description.toString() : null,
      user_id: user.id,
      season: season ? season.toString() : null,
      occasion: occasion ? occasion.toString() : null,
    }

    console.log("Outfit data to insert:", outfitData)

    const { data: outfit, error: outfitError } = await supabase.from("outfits").insert(outfitData).select()

    if (outfitError) {
      console.error("Error creating outfit - full error object:", JSON.stringify(outfitError, null, 2))
      console.error("Error code:", outfitError.code)
      console.error("Error message:", outfitError.message)
      console.error("Error details:", outfitError.details)
      console.error("Error hint:", outfitError.hint)

      return NextResponse.json(
        {
          error: `Failed to create outfit: ${outfitError.message || JSON.stringify(outfitError)}`,
        },
        { status: 500 },
      )
    }

    if (!outfit || outfit.length === 0) {
      console.error("No outfit returned after insert")
      return NextResponse.json({ error: "Failed to create outfit: No data returned" }, { status: 500 })
    }

    const createdOutfit = outfit[0]
    console.log("Outfit created successfully:", createdOutfit.id)

    // Добавляем элементы к образу
    const outfitItems = items.map((itemId: number, index: number) => ({
      outfit_id: createdOutfit.id,
      wardrobe_item_id: itemId,
      position: index,
    }))

    console.log("Adding outfit items:", outfitItems)

    const { error: itemsError } = await supabase.from("outfit_items").insert(outfitItems)

    if (itemsError) {
      console.error("Error adding items to outfit:", JSON.stringify(itemsError, null, 2))
      return NextResponse.json(
        {
          error: `Failed to add items to outfit: ${itemsError.message || JSON.stringify(itemsError)}`,
        },
        { status: 500 },
      )
    }

    console.log("Outfit created successfully with items")
    return NextResponse.json({ success: true, outfit: createdOutfit })
  } catch (error) {
    console.error("Unexpected error in outfits API:", error)
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace")

    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "10")

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

    // Получаем образы пользователя
    const { data: outfits, error } = await supabase
      .from("outfits")
      .select(`
        *,
        outfit_items (
          *,
          wardrobe_items (*)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("Error fetching outfits:", error)
      return NextResponse.json({ error: `Failed to fetch outfits: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ outfits })
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
      outfit_id: id,
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
    console.error("Error in outfits DELETE API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
