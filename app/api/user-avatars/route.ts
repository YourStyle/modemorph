import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: avatars, error } = await supabase
      .from("user_avatars")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching avatars:", error)
      return NextResponse.json({ error: "Failed to fetch avatars" }, { status: 500 })
    }

    return NextResponse.json({ avatars: avatars || [] })
  } catch (error) {
    console.error("Error in GET /api/user-avatars:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type and size
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 })
    }

    // Upload file to Supabase Storage
    const fileExt = file.name.split(".").pop()
    const fileName = `${user.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file)

    if (uploadError) {
      console.error("Error uploading file:", uploadError)
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(fileName)

    // Check if this is the user's first avatar
    const { data: existingAvatars } = await supabase.from("user_avatars").select("id").eq("user_id", user.id)

    const isFirstAvatar = !existingAvatars || existingAvatars.length === 0

    // Save avatar to database
    const { data: avatar, error: dbError } = await supabase
      .from("user_avatars")
      .insert({
        user_id: user.id,
        avatar_url: publicUrl,
        name: file.name,
        is_primary: isFirstAvatar, // First avatar is automatically primary
      })
      .select()
      .single()

    if (dbError) {
      console.error("Error saving avatar to database:", dbError)
      // Clean up uploaded file
      await supabase.storage.from("avatars").remove([fileName])
      return NextResponse.json({ error: "Failed to save avatar" }, { status: 500 })
    }

    return NextResponse.json({ avatar })
  } catch (error) {
    console.error("Error in POST /api/user-avatars:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
