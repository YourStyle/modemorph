import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    const { is_primary } = await request.json()
    const avatarId = params.id

    // Verify the avatar belongs to the user
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
      // Set all other avatars to non-primary first
      await supabase.from("user_avatars").update({ is_primary: false }).eq("user_id", user.id).neq("id", avatarId)
    }

    // Update the avatar
    const { data: updatedAvatar, error: updateError } = await supabase
      .from("user_avatars")
      .update({ is_primary })
      .eq("id", avatarId)
      .eq("user_id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating avatar:", updateError)
      return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 })
    }

    return NextResponse.json({ avatar: updatedAvatar })
  } catch (error) {
    console.error("Error in PUT /api/user-avatars/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    const avatarId = params.id

    // Get the avatar to delete
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
    const url = new URL(avatar.avatar_url)
    const filePath = url.pathname.split("/storage/v1/object/public/avatars/")[1]

    // Delete from storage
    if (filePath) {
      await supabase.storage.from("avatars").remove([filePath])
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from("user_avatars")
      .delete()
      .eq("id", avatarId)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("Error deleting avatar:", deleteError)
      return NextResponse.json({ error: "Failed to delete avatar" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user-avatars/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
