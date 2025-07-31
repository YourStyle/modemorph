import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем профиль пользователя
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("Profile fetch error:", profileError)
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("User profile API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { full_name, avatar_url } = body

    // Создаем или обновляем профиль
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        full_name: full_name || "",
        avatar_url: avatar_url || "",
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (profileError) {
      console.error("Profile upsert error:", profileError)
      return NextResponse.json({ error: "Failed to create/update profile" }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("User profile POST API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { full_name, avatar_url } = body

    // Обновляем профиль
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: full_name || "",
        avatar_url: avatar_url || "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single()

    if (profileError) {
      console.error("Profile update error:", profileError)
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("User profile PUT API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
