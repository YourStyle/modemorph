import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const sort = searchParams.get("sort") || "newest"

    let query = supabase.from("wardrobe_user_items").select("*").eq("user_id", user.id)

    // Поиск
    if (search) {
      query = query.ilike("item_name", `%${search}%`)
    }

    // Сортировка
    switch (sort) {
      case "oldest":
        query = query.order("created_at", { ascending: true })
        break
      case "name":
        query = query.order("item_name", { ascending: true })
        break
      case "newest":
      default:
        query = query.order("created_at", { ascending: false })
        break
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching user wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error in wardrobe-user-items GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    console.log("Received POST body:", body)

    const itemData = {
      user_id: user.id,
      item_name: body.item_name || body.name || "Без названия", // Исправлен порядок проверки
      material: body.material || null,
      style: body.style || null,
      color: body.color || null,
      shade: body.shade || null,
      has_print: body.has_print || "нет",
      has_details: body.has_details || "нет",
      size_type: body.size_type || null,
      notes: body.notes || null,
      image_url: body.image_url || null,
      basic_item_id: body.basic_item_id || null,
      clothing_type: body.clothing_type || null,
      is_visible: true,
    }

    console.log("Inserting item data:", itemData)

    const { data, error } = await supabase.from("wardrobe_user_items").insert([itemData]).select().single()

    if (error) {
      console.error("Error inserting wardrobe item:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("Item inserted successfully:", data)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in wardrobe-user-items POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
