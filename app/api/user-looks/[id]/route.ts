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

    // Verify the look belongs to the user and delete it
    const { error } = await supabase
      .from("user_looks")
      .delete()
      .eq("id", lookId)
      .eq("user_id", user.id)

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

    // Update the look
    const { data: look, error: updateError } = await supabase
      .from("user_looks")
      .update({
        name,
        description,
        items,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lookId)
      .eq("user_id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating look:", updateError)
      return NextResponse.json({ error: "Failed to update look" }, { status: 500 })
    }

    return NextResponse.json(look)
  } catch (error) {
    console.error("Error in PUT /api/user-looks/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
