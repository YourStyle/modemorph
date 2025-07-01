import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).single()

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching profile:", error)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error in GET /api/user-profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { full_name, avatar_url } = body

    // Check if profile already exists
    const { data: existingProfile } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).single()

    if (existingProfile) {
      return NextResponse.json({ profile: existingProfile })
    }

    // Create new profile
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .insert({
        user_id: user.id,
        email: user.email || "",
        full_name: full_name || "",
        avatar_url: avatar_url || "",
        is_admin: false, // Default to regular user
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating profile:", error)
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error in POST /api/user-profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
