import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

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

    return NextResponse.json({ avatars })
  } catch (error) {
    console.error("Error in GET /api/user-avatars:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

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

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 })
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 })
    }

    // Upload to Supabase Storage
    const fileName = `${user.id}/${Date.now()}-${file.name}`
    const { data: uploadData, error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file)

    if (uploadError) {
      console.error("Error uploading file:", uploadError)
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(fileName)

    // Save avatar record to database
    const { data: avatar, error: dbError } = await supabase
      .from("user_avatars")
      .insert({
        user_id: user.id,
        url: publicUrl,
        is_primary: false,
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
