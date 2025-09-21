import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import { put } from "@vercel/blob"
import { nanoid } from "nanoid"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const formData = await req.formData()

    // Получаем данные из формы
    const itemName = formData.get("item_name") as string
    const itemType = formData.get("item_type") as string
    const color = formData.get("color") as string
    const sizeType = formData.get("size_type") as string
    const material = formData.get("material") as string
    const style = formData.get("style") as string
    const hasPrint = formData.get("has_print") === "true" ? "Y" : "N"
    const hasDetails = formData.get("has_details") === "true" ? "Y" : "N"
    const shade = formData.get("shade") as string
    const url = formData.get("url") as string
    const isBasic = formData.get("is_basic") === "true"
    const notes = formData.get("notes") as string
    const imageFile = formData.get("image") as File | null
    const basicItemRef = formData.get("basic_item_ref") as string
    const materialRef = formData.get("material_ref") as string
    const typeRef = formData.get("type_ref") as string

    // Проверяем обязательные поля
    if (!itemName || !color) {
      return NextResponse.json({ error: "Missing required fields: item_name, color" }, { status: 400 })
    }

    // Если тип не указан напрямую, но указан typeRef, получаем код типа из таблицы типов
    let finalItemType = itemType
    if (!finalItemType && typeRef) {
      const { data: typeData } = await supabase.from("clothing_types").select("code").eq("id", typeRef).single()

      if (typeData) {
        finalItemType = typeData.code
      }
    }

    // Проверяем, что тип одежды указан
    if (!finalItemType) {
      return NextResponse.json({ error: "Missing required field: item_type" }, { status: 400 })
    }

    // Проверяем, существует ли колонка is_basic
    const { data: columnExists, error: columnCheckError } = await supabase
      .rpc("column_exists", {
        table_name: "wardrobe_items",
        column_name: "is_basic",
      })
      .single()

    // Загружаем изоб��ажение, если оно есть
    let imageUrl = null
    if (imageFile && imageFile.size > 0) {
      try {
        // Создаем уникальное имя файла на основе item_name
        const fileName = `${itemName.toLowerCase().replace(/[^a-z0-9-_]/g, "-")}-${nanoid(6)}`
        const fileExtension = imageFile.name.split(".").pop()
        const fullFileName = `${fileName}.${fileExtension}`

        // Загружаем файл в Vercel Blob
        const blob = await put(fullFileName, imageFile, {
          access: "public",
        })

        imageUrl = blob.url
      } catch (error) {
        console.error("Error uploading image:", error)
        return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
      }
    }

    // Создаем базовый объект для вставки
    const itemData: any = {
      item_name: itemName,
      item_type: finalItemType,
      color: color,
      size_type: sizeType || null,
      material: material || null,
      style: style || null,
      has_print: hasPrint,
      has_details: hasDetails,
      shade: shade || null,
      url: url || null,
      notes: notes || null,
      image_url: imageUrl,
    }

    // Добавляем ссылки на базовые элементы
    if (basicItemRef) {
      itemData.basic_item_ref = Number.parseInt(basicItemRef)
    }

    if (materialRef) {
      itemData.material_ref = Number.parseInt(materialRef)
    }

    if (typeRef) {
      itemData.type_ref = Number.parseInt(typeRef)
    }

    // Добавляем поле is_basic только если колонка существует
    if (!columnCheckError && columnExists) {
      itemData.is_basic = isBasic
    }

    // Создаем запись в базе данных
    const { data, error } = await supabase.from("wardrobe_items").insert(itemData).select()

    if (error) {
      console.error("Error adding wardrobe item:", error)
      return NextResponse.json({ error: `Failed to add wardrobe item: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      item: data[0],
    })
  } catch (error) {
    console.error("Unexpected error in add wardrobe item API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
