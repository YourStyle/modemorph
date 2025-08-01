import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const itemId = params.id

    const updateData = {
      item_name: body.item_name,
      material: body.material,
      style: body.style,
      color: body.color,
      shade: body.shade,
      has_print: body.has_print,
      has_details: body.has_details,
      size_type: body.size_type,
      notes: body.notes,
      basic_item_id: body.basic_item_id,
      image_url: body.image_url,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("wardrobe_user_items")
      .update(updateData)
      .eq("id", itemId)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating wardrobe item:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in wardrobe-user-items PUT:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const itemId = params.id

    const { error } = await supabase.from("wardrobe_user_items").delete().eq("id", itemId).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting wardrobe item:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in wardrobe-user-items DELETE:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
