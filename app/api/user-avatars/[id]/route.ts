import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { is_primary } = await request.json()
    const avatarId = params.id

    // Verify avatar belongs to user
    const { data: avatar, error: fetchError } = await supabase
      .from("user_avatars")
      .select("*")
      .eq("id", avatarId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 })
    }

    if (is_primary) {
      // First, set all user's avatars to non-primary
      await supabase.from("user_avatars").update({ is_primary: false }).eq("user_id", user.id)

      // Then set this avatar as primary
      const { data: updatedAvatar, error: updateError } = await supabase
        .from("user_avatars")
        .update({ is_primary: true })
        .eq("id", avatarId)
        .eq("user_id", user.id)
        .select()
        .single()

      if (updateError) {
        console.error("Error updating avatar:", updateError)
        return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 })
      }

      return NextResponse.json({ avatar: updatedAvatar })
    }

    return NextResponse.json({ avatar })
  } catch (error) {
    console.error("Error in PUT /api/user-avatars/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const avatarId = params.id

    // Get avatar info before deletion
    const { data: avatar, error: fetchError } = await supabase
      .from("user_avatars")
      .select("*")
      .eq("id", avatarId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 })
    }

    // Extract file path from URL
    const url = new URL(avatar.url)
    const filePath = url.pathname.split("/").slice(-2).join("/") // Get last two parts of path

    // Delete from storage
    const { error: storageError } = await supabase.storage.from("avatars").remove([filePath])

    if (storageError) {
      console.error("Error deleting file from storage:", storageError)
    }

    // Delete from database
    const { error: dbError } = await supabase.from("user_avatars").delete().eq("id", avatarId).eq("user_id", user.id)

    if (dbError) {
      console.error("Error deleting avatar from database:", dbError)
      return NextResponse.json({ error: "Failed to delete avatar" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user-avatars/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
