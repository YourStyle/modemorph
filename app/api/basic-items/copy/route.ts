import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем оригинальную базовую вещь
    const { data: originalItem, error: fetchError } = await supabase
      .from("basic_wardrobe_items")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !originalItem) {
      console.error("Error fetching original item:", fetchError)
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Получаем связанные материалы (если таблица существует)
    let materials: any[] = []
    try {
      const { data: materialsData } = await supabase
        .from("basic_item_materials")
        .select("basic_material_id")
        .eq("basic_item_id", id)
      materials = materialsData || []
    } catch (materialsError) {
      console.log("Materials table doesn't exist yet, skipping materials copy")
    }

    // Создаем копию базовой вещи
    const { data: newItem, error: createError } = await supabase
      .from("basic_wardrobe_items")
      .insert({
        name_ru: `${originalItem.name_ru} (копия)`,
        name_en: originalItem.name_en ? `${originalItem.name_en} (copy)` : null,
        description: originalItem.description,
        image_url: originalItem.image_url,
      })
      .select()
      .single()

    if (createError) {
      console.error("Error creating copy:", createError)
      return NextResponse.json({ error: `Failed to create copy: ${createError.message}` }, { status: 500 })
    }

    // Копируем связи с материалами (если есть)
    if (materials.length > 0) {
      try {
        const materialLinks = materials.map((material) => ({
          basic_item_id: newItem.id,
          basic_material_id: material.basic_material_id,
        }))

        const { error: materialsError } = await supabase.from("basic_item_materials").insert(materialLinks)

        if (materialsError) {
          console.error("Error copying materials:", materialsError)
          // Не возвращаем ошибку, так как основная вещь уже создана
        }
      } catch (materialsError) {
        console.log("Error copying materials, but item was created successfully")
      }
    }

    return NextResponse.json({ success: true, item: newItem })
  } catch (error) {
    console.error("Error in copy basic item API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
