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

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Добавляем user_id к данным
    const itemData = {
      ...body,
      user_id: user.id,
    }

    const { data, error } = await supabase.from("wardrobe_user_items").insert([itemData]).select().single()

    if (error) {
      console.error("Error creating wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create item" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in POST /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
