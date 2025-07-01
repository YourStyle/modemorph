import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"

export async function GET(request: Request) {
  try {
    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Fetching wardrobe items for user:", user.id)

    // Получаем все видимые вещи пользователя
    const { data, error } = await supabase
      .from("wardrobe_user_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch wardrobe items" }, { status: 500 })
    }

    console.log("Found wardrobe items:", data?.length || 0)
    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error in wardrobe user items API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { item_name, material, color, shade, style, has_print, has_details, image_url, basic_item_id } = body

    if (!item_name) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 })
    }

    console.log("Creating wardrobe item:", { item_name, material, image_url })

    const { data, error } = await supabase
      .from("wardrobe_user_items")
      .insert({
        user_id: user.id,
        item_name,
        material: material || "",
        color: color || "",
        shade: shade || "",
        style: style || "",
        has_print: has_print || "no",
        has_details: has_details || "no",
        image_url: image_url || "",
        basic_item_id: basic_item_id || null,
        is_visible: true,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create wardrobe item" }, { status: 500 })
    }

    console.log("Created wardrobe item:", data)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in wardrobe user items API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
