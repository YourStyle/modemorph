import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase.from("basic_items").select("*").order("id", { ascending: true })

    if (error) {
      console.error("Error fetching basic items:", error)
      return NextResponse.json({ error: "Failed to fetch basic items" }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in GET /api/basic-items:", error)
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
    const { item_name, clothing_type_id, material, shade, style, has_print, has_details, img_url } = body

    const { data: newItem, error } = await supabase
      .from("basic_items")
      .insert({
        item_name,
        clothing_type_id,
        material,
        shade,
        style,
        has_print: has_print || false,
        has_details: has_details || false,
        img_url,
        is_visible: true,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating basic item:", error)
      return NextResponse.json({ error: "Failed to create basic item" }, { status: 500 })
    }

    return NextResponse.json(newItem)
  } catch (error) {
    console.error("Unexpected error in basic-items POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
