import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createClient()

    // Проверяем авторизацию
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Получаем базовые вещи из таблицы basic_wardrobe_items
    const { data: items, error } = await supabase
      .from("basic_wardrobe_items")
      .select("id, name_ru, name_en, description, image_url")
      .order("name_ru")

    if (error) {
      console.error("Error fetching basic wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch basic items" }, { status: 500 })
    }

    return NextResponse.json({ items: items || [] })
  } catch (error) {
    console.error("Error in basic wardrobe items API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
