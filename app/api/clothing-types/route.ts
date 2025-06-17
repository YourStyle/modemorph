import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"

// GET - получение списка типов одежды
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")

    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Формируем запрос
    let query = supabase.from("clothing_types").select("*")

    // Фильтруем по категории, если она указана
    if (category) {
      query = query.eq("category", category)
    }

    // Выполняем запрос
    const { data, error } = await query.order("name_ru")

    if (error) {
      console.error("Error fetching clothing types:", error)
      return NextResponse.json({ error: "Failed to fetch clothing types" }, { status: 500 })
    }

    return NextResponse.json({ types: data })
  } catch (error) {
    console.error("Error in clothing types API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

// POST - создание нового типа одежды
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code, name_ru, name_en, category, description } = body

    // Проверяем обязательные поля
    if (!code || !name_ru || !name_en) {
      return NextResponse.json({ error: "Code, name_ru and name_en are required" }, { status: 400 })
    }

    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Проверяем, существует ли тип с таким кодом
    const { data: existingType } = await supabase.from("clothing_types").select("id").eq("code", code).single()

    if (existingType) {
      return NextResponse.json({ error: "Type with this code already exists" }, { status: 400 })
    }

    // Создаем запись
    const { data, error } = await supabase
      .from("clothing_types")
      .insert({
        code,
        name_ru,
        name_en,
        category: category || null,
        description: description || null,
      })
      .select()

    if (error) {
      console.error("Error creating clothing type:", error)
      return NextResponse.json({ error: "Failed to create clothing type" }, { status: 500 })
    }

    return NextResponse.json({ success: true, type: data[0] })
  } catch (error) {
    console.error("Error in clothing types API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

// DELETE - удаление типа одежды
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Проверяем, используется ли тип в wardrobe_items
    const { data: usedItems } = await supabase.from("wardrobe_items").select("id").eq("type_ref", id).limit(1)

    if (usedItems && usedItems.length > 0) {
      return NextResponse.json({ error: "Cannot delete clothing type that is used by wardrobe items" }, { status: 400 })
    }

    // Удаляем запись
    const { error } = await supabase.from("clothing_types").delete().eq("id", id)

    if (error) {
      console.error("Error deleting clothing type:", error)
      return NextResponse.json({ error: "Failed to delete clothing type" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in clothing types API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
