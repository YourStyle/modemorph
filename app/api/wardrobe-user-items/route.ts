import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем вещи пользователя с связанными базовыми элементами
    const { data: items, error } = await supabase
      .from("wardrobe_user_items")
      .select(`
        *,
        basic_wardrobe_items (
          id,
          name_ru,
          name_en,
          description,
          image_url
        )
      `)
      .eq("user_id", user.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    // Преобразуем данные в формат WardrobeItem
    const wardrobeItems =
      items?.map((item) => ({
        id: item.id,
        item_name: item.item_name || item.basic_wardrobe_items?.name_ru || "Без названия",
        size_type: item.size_type || "",
        material: item.material || "",
        style: item.style || "",
        has_print: item.has_print || "нет",
        color: item.color || "",
        shade: item.shade || "",
        has_details: item.has_details || "нет",
        url: item.url || "",
        created_at: item.created_at,
        updated_at: item.updated_at,
        image_url: item.image_url,
        is_basic: item.is_basic || false,
        is_hidden: item.is_hidden || false,
        basic_item_id: item.basic_item_id,
        basic_material_id: item.basic_material_id,
        notes: item.notes,
        basic_wardrobe_items: item.basic_wardrobe_items,
      })) || []

    return NextResponse.json(wardrobeItems)
  } catch (error) {
    console.error("Error in wardrobe-user-items API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { basic_item_id, material, color, style, size_type, image_url, notes } = body

    // Создаем новую вещь пользователя
    const { data: newItem, error } = await supabase
      .from("wardrobe_user_items")
      .insert({
        user_id: user.id,
        basic_item_id,
        material: material || "",
        color: color || "",
        style: style || "",
        size_type: size_type || "",
        image_url: image_url || null,
        notes: notes || "",
        is_hidden: false,
      })
      .select(`
        *,
        basic_wardrobe_items (
          id,
          name_ru,
          name_en,
          description,
          image_url
        )
      `)
      .single()

    if (error) {
      console.error("Error creating user wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create item" }, { status: 500 })
    }

    // Преобразуем в формат WardrobeItem
    const wardrobeItem = {
      id: newItem.id,
      item_name: newItem.item_name || newItem.basic_wardrobe_items?.name_ru || "Без названия",
      size_type: newItem.size_type || "",
      material: newItem.material || "",
      style: newItem.style || "",
      has_print: newItem.has_print || "нет",
      color: newItem.color || "",
      shade: newItem.shade || "",
      has_details: newItem.has_details || "нет",
      url: newItem.url || "",
      created_at: newItem.created_at,
      updated_at: newItem.updated_at,
      image_url: newItem.image_url,
      is_basic: newItem.is_basic || false,
      is_hidden: newItem.is_hidden || false,
      basic_item_id: newItem.basic_item_id,
      basic_material_id: newItem.basic_material_id,
      notes: newItem.notes,
      basic_wardrobe_items: newItem.basic_wardrobe_items,
    }

    return NextResponse.json(wardrobeItem)
  } catch (error) {
    console.error("Error in wardrobe-user-items POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
