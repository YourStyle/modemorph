import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Try to get existing profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Error fetching profile:", profileError)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    if (!profile) {
      // Create profile if it doesn't exist
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || "",
          avatar_url: user.user_metadata?.avatar_url || "",
          role: "user",
        })
        .select()
        .single()

      if (createError) {
        console.error("Error creating profile:", createError)
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
      }

      return NextResponse.json(newProfile)
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error("Unexpected error in user-profile API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { full_name, avatar_url } = body

    // Check if profile already exists
    const { data: existingProfile } = await supabase.from("profiles").select("id").eq("id", user.id).single()

    if (existingProfile) {
      // Update existing profile
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: full_name || "",
          avatar_url: avatar_url || "",
        })
        .eq("id", user.id)
        .select()
        .single()

      if (updateError) {
        console.error("Error updating profile:", updateError)
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
      }

      return NextResponse.json(updatedProfile)
    } else {
      // Create new profile
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          full_name: full_name || "",
          avatar_url: avatar_url || "",
          role: "user",
        })
        .select()
        .single()

      if (createError) {
        console.error("Error creating profile:", createError)
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
      }

      return NextResponse.json(newProfile)
    }
  } catch (error) {
    console.error("Unexpected error in user-profile POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
