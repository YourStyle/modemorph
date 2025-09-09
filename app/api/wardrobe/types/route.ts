import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

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
