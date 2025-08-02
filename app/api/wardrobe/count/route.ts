import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Подсчитываем количество вещей пользователя
    const { count, error } = await supabase
      .from("wardrobe_user_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    if (error) {
      console.error("Error counting wardrobe items:", error)
      return NextResponse.json({ error: "Failed to count wardrobe items" }, { status: 500 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    console.error("Error in wardrobe count API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
