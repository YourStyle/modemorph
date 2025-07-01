import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (profileError && profileError.code !== "PGRST116") {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error getting profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Используем service role для создания профиля
    const serviceSupabase = createClient(true) // true для service role

    const { data: profile, error: createError } = await serviceSupabase
      .from("user_profiles")
      .insert({
        user_id: user.id,
        email: user.email,
        is_admin: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error creating profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
