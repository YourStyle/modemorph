import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const lookId = Number.parseInt(params.id)
    if (isNaN(lookId)) {
      return NextResponse.json({ error: "Invalid look ID" }, { status: 400 })
    }

    const { error } = await supabase.from("user_looks").delete().eq("id", lookId).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting look:", error)
      return NextResponse.json({ error: "Failed to delete look" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user-looks/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const lookId = Number.parseInt(params.id)
    if (isNaN(lookId)) {
      return NextResponse.json({ error: "Invalid look ID" }, { status: 400 })
    }

    const body = await request.json()
    const { name, description, items } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (items !== undefined) updateData.items = items

    const { data: updatedLook, error } = await supabase
      .from("user_looks")
      .update(updateData)
      .eq("id", lookId)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating look:", error)
      return NextResponse.json({ error: "Failed to update look" }, { status: 500 })
    }

    return NextResponse.json(updatedLook)
  } catch (error) {
    console.error("Error in PUT /api/user-looks/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
