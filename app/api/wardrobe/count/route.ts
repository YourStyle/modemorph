import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

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
