import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  try {
    // Используем service role для операций с базой (публичные данные)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Проверяем, существует ли колонка is_basic
    const { data: columnExists, error: columnCheckError } = await supabase
      .rpc("column_exists", {
        table_name: "wardrobe_items",
        column_name: "is_basic",
      })
      .single()

    // Если колонка не существует, возвращаем пустой массив и флаг needsMigration
    if (columnCheckError || !columnExists) {
      console.log("Column is_basic does not exist yet, returning empty array")
      return NextResponse.json({ items: [], needsMigration: true })
    }

    // Получаем все базовые вещи
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("id, item_name, item_type, color")
      .eq("is_basic", true)
      .order("item_type")
      .order("item_name")

    if (error) {
      console.error("Error fetching basic wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch basic wardrobe items" }, { status: 500 })
    }

    return NextResponse.json({ items: data, needsMigration: false })
  } catch (error) {
    console.error("Error in basic wardrobe items API:", error)
    return NextResponse.json({ items: [], needsMigration: true }) // Возвращаем пустой массив и флаг needsMigration
  }
}
