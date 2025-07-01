import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userItems, error } = await supabase
      .from("wardrobe_user_items")
      .select(`
        id,
        user_id,
        item_name,
        material,
        shade,
        style,
        has_print,
        has_details,
        image_url,
        basic_item_id,
        is_visible,
        created_at,
        basic_items (
          id,
          item_name,
          img_url,
          clothing_types (
            name,
            category
          )
        )
      `)
      .eq("user_id", user.id)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch wardrobe items" }, { status: 500 })
    }

    return NextResponse.json(userItems || [])
  } catch (error) {
    console.error("Unexpected error in wardrobe-user-items API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { item_name, material, shade, style, has_print, has_details, image_url, basic_item_id } = body

    const { data: newItem, error } = await supabase
      .from("wardrobe_user_items")
      .insert({
        user_id: user.id,
        item_name,
        material,
        shade,
        style,
        has_print: has_print || false,
        has_details: has_details || false,
        image_url,
        basic_item_id,
        is_visible: true,
      })
      .select(`
        id,
        user_id,
        item_name,
        material,
        shade,
        style,
        has_print,
        has_details,
        image_url,
        basic_item_id,
        is_visible,
        created_at,
        basic_items (
          id,
          item_name,
          img_url,
          clothing_types (
            name,
            category
          )
        )
      `)
      .single()

    if (error) {
      console.error("Error creating user wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create wardrobe item" }, { status: 500 })
    }

    return NextResponse.json(newItem)
  } catch (error) {
    console.error("Unexpected error in wardrobe-user-items POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
