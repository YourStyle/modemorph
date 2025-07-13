import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, items, image_url } = body

    // Validate items format if provided
    if (items && Array.isArray(items)) {
      const validItems = items.every(
        (item) =>
          typeof item === "object" && item.type && ["user", "basic"].includes(item.type) && typeof item.id === "number",
      )

      if (!validItems) {
        return NextResponse.json({ error: "Invalid items format" }, { status: 400 })
      }
    }

    const { data: look, error } = await supabase
      .from("user_looks")
      .update({
        name,
        description,
        items,
        image_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating user look:", error)
      return NextResponse.json({ error: "Failed to update look" }, { status: 500 })
    }

    return NextResponse.json(look)
  } catch (error) {
    console.error("Error in PUT /api/user-looks/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase.from("user_looks").delete().eq("id", params.id).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting user look:", error)
      return NextResponse.json({ error: "Failed to delete look" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user-looks/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
