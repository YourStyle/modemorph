import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { is_active } = await request.json()

    // Если делаем аватар активным, деактивируем все остальные
    if (is_active) {
      await supabase.from("user_avatars").update({ is_active: false }).eq("user_id", user.id)
    }

    const { data: avatar, error } = await supabase
      .from("user_avatars")
      .update({ is_active })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating avatar:", error)
      return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 })
    }

    return NextResponse.json({ avatar })
  } catch (error) {
    console.error("Error in PATCH /api/user-avatars:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase.from("user_avatars").delete().eq("id", params.id).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting avatar:", error)
      return NextResponse.json({ error: "Failed to delete avatar" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user-avatars:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
