import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
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
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { image_url, is_active } = await request.json()

    if (!image_url) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }

    // Если новый аватар активный, деактивируем все остальные
    if (is_active) {
      await supabase.from("user_avatars").update({ is_active: false }).eq("user_id", user.id)
    }

    const { data: avatar, error } = await supabase
      .from("user_avatars")
      .insert({
        user_id: user.id,
        image_url,
        is_active: is_active || false,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating avatar:", error)
      return NextResponse.json({ error: "Failed to create avatar" }, { status: 500 })
    }

    return NextResponse.json({ avatar })
  } catch (error) {
    console.error("Error in POST /api/user-avatars:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
