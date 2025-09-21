import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  try {
    // Используем service role для операций с базой (публичные данные)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data, error } = await supabase.from("wardrobe_items").select("item_type").order("item_type")

    if (error) {
      throw error
    }

    // Получаем уникальные типы
    const uniqueTypes = [...new Set(data.map((item) => item.item_type))].filter(Boolean)

    return NextResponse.json({ types: uniqueTypes })
  } catch (error) {
    console.error("Error fetching wardrobe types:", error)
    return NextResponse.json({ error: "Failed to fetch wardrobe types" }, { status: 500 })
  }
}
