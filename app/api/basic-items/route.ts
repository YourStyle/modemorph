import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"

// GET - получение списка базовых вещей
export async function GET(request: Request) {
  try {
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

    // Проверяем, существует ли таблица basic_wardrobe_items
    const { data: tableExists } = await supabase.rpc("exec_sql", {
      sql_query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'basic_wardrobe_items'
        );
      `,
    })

    if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
      return NextResponse.json({ error: "Basic wardrobe items table does not exist" }, { status: 404 })
    }

    // Получаем список базовых вещей
    const { data, error } = await supabase.from("basic_wardrobe_items").select("*").order("name_ru")

    if (error) {
      console.error("Error fetching basic items:", error)
      return NextResponse.json({ error: "Failed to fetch basic items" }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error in basic items API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

// POST - создание новой базовой вещи
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name_ru, name_en, type_id, description, image_url } = body

    // Проверяем обязательные поля
    if (!name_ru || !name_en) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
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

    // Проверяем, существует ли таблица basic_wardrobe_items
    const { data: tableExists } = await supabase.rpc("exec_sql", {
      sql_query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'basic_wardrobe_items'
        );
      `,
    })

    if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
      return NextResponse.json({ error: "Basic wardrobe items table does not exist" }, { status: 404 })
    }

    // Создаем запись
    const { data, error } = await supabase
      .from("basic_wardrobe_items")
      .insert({
        name_ru,
        name_en,
        type_id: type_id ? Number.parseInt(type_id) : null,
        description: description || null,
        image_url: image_url || null,
      })
      .select()

    if (error) {
      console.error("Error creating basic item:", error)
      return NextResponse.json({ error: "Failed to create basic item" }, { status: 500 })
    }

    return NextResponse.json({ success: true, item: data[0] })
  } catch (error) {
    console.error("Error in basic items API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

// DELETE - удаление базовой вещи
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

    // Проверяем, существует ли таблица basic_wardrobe_items
    const { data: tableExists } = await supabase.rpc("exec_sql", {
      sql_query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'basic_wardrobe_items'
        );
      `,
    })

    if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
      return NextResponse.json({ error: "Basic wardrobe items table does not exist" }, { status: 404 })
    }

    // Проверяем, используется ли базовая вещь в wardrobe_items
    const { data: usedItems } = await supabase.from("wardrobe_items").select("id").eq("basic_item_ref", id).limit(1)

    if (usedItems && usedItems.length > 0) {
      return NextResponse.json({ error: "Cannot delete basic item that is used by wardrobe items" }, { status: 400 })
    }

    // Удаляем запись
    const { error } = await supabase.from("basic_wardrobe_items").delete().eq("id", id)

    if (error) {
      console.error("Error deleting basic item:", error)
      return NextResponse.json({ error: "Failed to delete basic item" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in basic items API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
