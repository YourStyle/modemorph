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

    console.log("Attempting to delete item with ID:", itemId)

    // Удаляем вещь напрямую без предварительной проверки
    const { data: deleteData, error: deleteError } = await supabase
      .from("wardrobe_user_items")
      .delete()
      .eq("id", itemId)
      .select()

    console.log("Delete operation result:", { deleteData, deleteError })

    if (deleteError) {
      console.error("Error deleting wardrobe item:", deleteError)
      return NextResponse.json({ error: `Database error: ${deleteError.message}` }, { status: 500 })
    }

    // Проверяем, была ли удалена хотя бы одна запись
    if (!deleteData || deleteData.length === 0) {
      console.log("No rows were deleted - item not found")
      return NextResponse.json({ error: "Item not found or already deleted" }, { status: 404 })
    }

    console.log("Successfully deleted item:", deleteData)
    return NextResponse.json({ success: true, deleted: deleteData })
  } catch (error) {
    console.error("Error in DELETE /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

    const body = await request.json()
    const { is_hidden } = body

    if (typeof is_hidden !== "boolean") {
      return NextResponse.json({ error: "Invalid is_hidden value" }, { status: 400 })
    }

    console.log("Attempting to update visibility for item:", itemId, "to:", is_hidden)

    // Обновляем видимость вещи
    const { data: updateData, error: updateError } = await supabase
      .from("wardrobe_user_items")
      .update({ is_hidden })
      .eq("id", itemId)
      .select()

    console.log("Update operation result:", { updateData, updateError })

    if (updateError) {
      console.error("Error updating wardrobe item visibility:", updateError)
      return NextResponse.json({ error: `Database error: ${updateError.message}` }, { status: 500 })
    }

    if (!updateData || updateData.length === 0) {
      console.log("No rows were updated - item not found")
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    console.log("Successfully updated item:", updateData)
    return NextResponse.json({ success: true, updated: updateData })
  } catch (error) {
    console.error("Error in PATCH /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
