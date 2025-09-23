import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)

    const url = new URL(req.url)
    const gender = url.searchParams.get("gender")

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем все базовые вещи с учётом пола
    let query = supabase.from("basic_wardrobe_items").select("*").order("name_ru")

    if (gender) {
      query = query.or(`gender.eq.${gender},gender.eq.unisex,gender.is.null`)
    }

    const { data: basicItems, error: basicError } = await query

    if (basicError) {
      console.error("Error fetching basic items:", basicError)
      return NextResponse.json({ error: "Failed to fetch basic items" }, { status: 500 })
    }

    // Получаем уже добавленные пользователем вещи
    const { data: userItems, error: userError2 } = await supabase
      .from("wardrobe_user_items")
      .select("basic_item_id")
      .eq("user_id", user.id)
      .not("basic_item_id", "is", null)

    if (userError2) {
      console.error("Error fetching user items:", userError2)
      return NextResponse.json({ error: "Failed to fetch user items" }, { status: 500 })
    }

    // Создаем Set из ID уже добавленных базовых вещей
    const addedBasicItemIds = new Set(userItems?.map((item) => item.basic_item_id) || [])

    // Фильтруем базовые вещи, исключая уже добавленные
    const availableBasicItems = (basicItems || [])
      .filter((item) => !addedBasicItemIds.has(item.id))
      .map((item) => ({
        id: item.id,
        item_name: item.name_ru || item.name_en || "Без названия",
        description: item.description,
        clothing_type: item.clothing_type || "Одежда",
        image_url: item.image_url,
        gender: item.gender || null,
        material: "",
        style: "",
        color: "",
        shade: "",
        has_print: "нет",
        has_details: "нет",
      }))

    return NextResponse.json(availableBasicItems)
  } catch (error) {
    console.error("Error in basic wardrobe items API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
