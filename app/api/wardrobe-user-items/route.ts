import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("wardrobe_user_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error in GET /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
    console.log("Received item data:", body)

    // Правильно маппим данные на колонки таблицы wardrobe_user_items
    const itemData = {
      user_id: user.id,
      item_name: body.item_name || body.name || "Без названия", // Исправлен порядок проверки
      material: body.material || "",
      color: body.color || "",
      style: body.style || "",
      has_print: body.has_print || body.print || "нет",
      image_url: body.image_url || null,
      basic_item_id: body.basic_item_id ? Number.parseInt(body.basic_item_id) : null,
      is_hidden: false,
      size_type: body.size_type || "",
      shade: body.shade || "",
      has_details: body.has_details || "нет",
      url: body.url || "",
      notes: body.notes || "",
    }

    console.log("Saving item data:", itemData)

    const { data, error } = await supabase.from("wardrobe_user_items").insert([itemData]).select().single()

    if (error) {
      console.error("Error creating wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create item", details: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in POST /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
