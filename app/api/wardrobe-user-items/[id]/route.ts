import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const itemId = params.id

    console.log("Attempting to delete user wardrobe item:", itemId)

    // Получаем текущего пользователя
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Authentication error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    // Проверяем, что вещь принадлежит пользователю
    const { data: existingItem, error: checkError } = await supabase
      .from("wardrobe_user_items")
      .select("id, user_id")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single()

    if (checkError || !existingItem) {
      console.error("Item not found or access denied:", checkError)
      return NextResponse.json({ error: "Item not found or access denied" }, { status: 404 })
    }

    console.log("Item found and belongs to user:", existingItem)

    // Удаляем вещь
    const { error: deleteError } = await supabase
      .from("wardrobe_user_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id) // Дополнительная проверка безопасности

    if (deleteError) {
      console.error("Error deleting item:", deleteError)
      return NextResponse.json({ error: "Failed to delete item" }, { status: 500 })
    }

    console.log("Item deleted successfully")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const itemId = params.id
    const body = await request.json()

    console.log("Attempting to update user wardrobe item:", itemId, body)

    // Получаем текущего пользователя
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Authentication error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Проверяем, что вещь принадлежит пользователю
    const { data: existingItem, error: checkError } = await supabase
      .from("wardrobe_user_items")
      .select("id, user_id")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single()

    if (checkError || !existingItem) {
      console.error("Item not found or access denied:", checkError)
      return NextResponse.json({ error: "Item not found or access denied" }, { status: 404 })
    }

    // Обновляем вещь
    const { data, error: updateError } = await supabase
      .from("wardrobe_user_items")
      .update(body)
      .eq("id", itemId)
      .eq("user_id", user.id) // Дополнительная проверка безопасности
      .select()
      .single()

    if (updateError) {
      console.error("Error updating item:", updateError)
      return NextResponse.json({ error: "Failed to update item" }, { status: 500 })
    }

    console.log("Item updated successfully:", data)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
