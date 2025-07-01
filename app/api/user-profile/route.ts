import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Проверяем, есть ли уже профиль
    const { data: existingProfile } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).single()

    if (existingProfile) {
      return NextResponse.json(existingProfile)
    }

    // Создаем новый профиль
    const { data: newProfile, error: insertError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: user.id,
        is_admin: false, // По умолчанию обычный пользователь
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error("Error creating profile:", insertError)
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
    }

    return NextResponse.json(newProfile)
  } catch (error) {
    console.error("Error in POST /api/user-profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем профиль пользователя
    const { data: profile, error } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).single()

    if (error) {
      console.error("Error fetching profile:", error)
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error("Error in GET /api/user-profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
