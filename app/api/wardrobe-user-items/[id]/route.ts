import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      console.error("Authentication error: No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const itemId = params.id
    console.log("Attempting to delete user wardrobe item:", itemId)

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

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
    const itemId = params.id
    const body = await request.json()

    console.log("Attempting to update user wardrobe item:", itemId, body)

    const user = await getAuthUser(request)
    if (!user) {
      console.error("Authentication error: No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

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
