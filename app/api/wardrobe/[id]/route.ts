import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    const itemId = Number.parseInt(params.id)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 })
    }

    // Проверяем, что вещь принадлежит пользователю
    const { data: existingItem, error: fetchError } = await supabase
      .from("wardrobe_user_items")
      .select("id, user_id")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !existingItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Удаляем вещь
    const { error: deleteError } = await supabase
      .from("wardrobe_user_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("Error deleting wardrobe item:", deleteError)
      return NextResponse.json({ error: "Failed to delete item" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
