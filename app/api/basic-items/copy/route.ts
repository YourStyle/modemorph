import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Получаем оригинальную базовую вещь
    const { data: originalItem, error: fetchError } = await supabase
      .from("basic_wardrobe_items")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !originalItem) {
      console.error("Fetch error:", fetchError)
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Создаем копию с измененным названием
    const copyData = {
      name_ru: `${originalItem.name_ru} (копия)`,
      name_en: originalItem.name_en ? `${originalItem.name_en} (copy)` : null,
      description: originalItem.description,
      image_url: originalItem.image_url, // Используем то же изображение
      gender: originalItem.gender,
    }

    const { data: newItem, error: createError } = await supabase
      .from("basic_wardrobe_items")
      .insert([copyData])
      .select()
      .single()

    if (createError) {
      console.error("Error creating copy:", createError)
      return NextResponse.json({ error: "Failed to create copy" }, { status: 500 })
    }

    // Копируем связи с материалами если они есть
    const { data: materialRelations, error: materialsError } = await supabase
      .from("basic_item_materials")
      .select("basic_material_id")
      .eq("basic_item_id", id)

    if (!materialsError && materialRelations && materialRelations.length > 0) {
      const newRelations = materialRelations.map((rel) => ({
        basic_item_id: newItem.id,
        basic_material_id: rel.basic_material_id,
      }))

      const { error: relationsError } = await supabase.from("basic_item_materials").insert(newRelations)

      if (relationsError) {
        console.error("Error copying material relations:", relationsError)
        // Не прерываем процесс, просто логируем ошибку
      }
    }

    return NextResponse.json({ success: true, item: newItem })
  } catch (error) {
    console.error("Error in copy API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
