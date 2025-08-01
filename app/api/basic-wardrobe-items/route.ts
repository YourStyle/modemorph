import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем все базовые вещи
    const { data: basicItems, error: basicError } = await supabase
      .from("basic_wardrobe_items")
      .select("*")
      .order("id", { ascending: true })

    if (basicError) {
      console.error("Error fetching basic items:", basicError)
      return NextResponse.json({ error: "Failed to fetch basic items" }, { status: 500 })
    }

    // Получаем уже добавленные пользователем базовые вещи
    const { data: userItems, error: userError2 } = await supabase
      .from("wardrobe_user_items")
      .select("basic_item_id")
      .eq("user_id", user.id)
      .not("basic_item_id", "is", null)

    if (userError2) {
      console.error("Error fetching user items:", userError2)
      return NextResponse.json({ error: "Failed to fetch user items" }, { status: 500 })
    }

    // Фильтруем базовые вещи, исключая уже добавленные
    const addedBasicItemIds = new Set(userItems?.map((item) => item.basic_item_id) || [])
    const availableBasicItems = basicItems?.filter((item) => !addedBasicItemIds.has(item.id)) || []

    return NextResponse.json(availableBasicItems)
  } catch (error) {
    console.error("Error in basic-wardrobe-items GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
