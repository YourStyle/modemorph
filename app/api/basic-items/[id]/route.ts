import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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

    const { data: basicItem, error } = await supabase
      .from("basic_items")
      .select(`
        id,
        item_name,
        clothing_type_id,
        material,
        shade,
        style,
        has_print,
        has_details,
        img_url,
        is_visible,
        clothing_types (
          id,
          name,
          category
        )
      `)
      .eq("id", params.id)
      .eq("is_visible", true)
      .single()

    if (error) {
      console.error("Error fetching basic item:", error)
      return NextResponse.json({ error: "Basic item not found" }, { status: 404 })
    }

    return NextResponse.json(basicItem)
  } catch (error) {
    console.error("Unexpected error in basic-items/[id] API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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

    const { data: updatedItem, error } = await supabase
      .from("basic_items")
      .update({
        item_name,
        clothing_type_id,
        material,
        shade,
        style,
        has_print,
        has_details,
        img_url,
      })
      .eq("id", params.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating basic item:", error)
      return NextResponse.json({ error: "Failed to update basic item" }, { status: 500 })
    }

    return NextResponse.json(updatedItem)
  } catch (error) {
    console.error("Unexpected error in basic-items/[id] PUT:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
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

    const { error } = await supabase.from("basic_items").update({ is_visible: false }).eq("id", params.id)

    if (error) {
      console.error("Error deleting basic item:", error)
      return NextResponse.json({ error: "Failed to delete basic item" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Unexpected error in basic-items/[id] DELETE:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
