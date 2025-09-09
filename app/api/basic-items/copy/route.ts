import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error("Auth error:", userError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
