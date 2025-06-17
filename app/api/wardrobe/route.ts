import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const types = searchParams.get("types")?.split(",").filter(Boolean) || []

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Проверяем, является ли пользователь админом
    const { data: profile } = await supabase.from("user_profiles").select("isAdmin").eq("id", user.id).single()

    const isAdmin = profile?.isAdmin || false

    let query = supabase.from("wardrobe_items").select(`
        *,
        basic_wardrobe_items (
          id,
          name_ru,
          name_en,
          description,
          image_url
        )
      `)

    // Для обычных пользователей показываем только видимые элементы
    if (!isAdmin) {
      query = query.eq("is_hidden", false)
    }

    // Поиск
    if (search) {
      query = query.or(`item_name.ilike.%${search}%,color.ilike.%${search}%,material.ilike.%${search}%`)
    }

    // Фильтр по типам (если нужен)
    if (types.length > 0) {
      // Здесь можно добавить фильтрацию по типам через basic_wardrobe_items
    }

    query = query.order("item_name")

    const { data: items, error } = await query

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch wardrobe items" }, { status: 500 })
    }

    return NextResponse.json({ items: items || [] })
  } catch (error) {
    console.error("Error in wardrobe API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      item_name,
      size_type,
      material,
      style,
      has_print,
      color,
      shade,
      has_details,
      url,
      image_url,
      is_basic,
      basic_item_id,
      basic_material_id,
      notes,
    } = body

    const { data, error } = await supabase
      .from("wardrobe_items")
      .insert({
        item_name,
        size_type: size_type || "",
        material: material || "",
        style: style || "",
        has_print: has_print || "N",
        color: color || "",
        shade: shade || "",
        has_details: has_details || "N",
        url: url || "",
        image_url: image_url || null,
        is_basic: is_basic || false,
        basic_item_id: basic_item_id || null,
        basic_material_id: basic_material_id || null,
        notes: notes || null,
        is_hidden: false, // По умолчанию новые элементы видимы
      })
      .select()
      .single()

    if (error) {
      console.error("Error adding wardrobe item:", error)
      return NextResponse.json({ error: "Failed to add wardrobe item" }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (error) {
    console.error("Error in wardrobe POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
