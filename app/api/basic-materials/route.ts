import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

// GET - получение списка базовых материалов
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Проверяем, существует ли таблица basic_materials
    const { data: tableExists } = await supabase.rpc("exec_sql", {
      sql_query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'basic_materials'
        );
      `,
    })

    if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
      return NextResponse.json({ error: "Basic materials table does not exist" }, { status: 404 })
    }

    // Получаем список базовых материалов
    const { data, error } = await supabase.from("basic_materials").select("*").order("name_ru")

    if (error) {
      console.error("Error fetching basic materials:", error)
      return NextResponse.json({ error: "Failed to fetch basic materials" }, { status: 500 })
    }

    return NextResponse.json({ materials: data })
  } catch (error) {
    console.error("Error in basic materials API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

// POST - создание нового базового материала
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { name_ru, name_en, description, properties } = body

    // Проверяем обязательные поля
    if (!name_ru || !name_en) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Проверяем, существует ли таблица basic_materials
    const { data: tableExists } = await supabase.rpc("exec_sql", {
      sql_query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'basic_materials'
        );
      `,
    })

    if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
      return NextResponse.json({ error: "Basic materials table does not exist" }, { status: 404 })
    }

    // Создаем запись
    const { data, error } = await supabase
      .from("basic_materials")
      .insert({
        name_ru,
        name_en,
        description: description || null,
        properties: properties || null,
      })
      .select()

    if (error) {
      console.error("Error creating basic material:", error)
      return NextResponse.json({ error: "Failed to create basic material" }, { status: 500 })
    }

    return NextResponse.json({ success: true, material: data[0] })
  } catch (error) {
    console.error("Error in basic materials API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

// DELETE - удаление базового материала
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Проверяем, существует ли таблица basic_materials
    const { data: tableExists } = await supabase.rpc("exec_sql", {
      sql_query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'basic_materials'
        );
      `,
    })

    if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
      return NextResponse.json({ error: "Basic materials table does not exist" }, { status: 404 })
    }

    // Проверяем, используется ли базовый материал в wardrobe_items
    const { data: usedItems } = await supabase.from("wardrobe_items").select("id").eq("material_ref", id).limit(1)

    if (usedItems && usedItems.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete basic material that is used by wardrobe items" },
        { status: 400 },
      )
    }

    // Удаляем запись
    const { error } = await supabase.from("basic_materials").delete().eq("id", id)

    if (error) {
      console.error("Error deleting basic material:", error)
      return NextResponse.json({ error: "Failed to delete basic material" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in basic materials API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
