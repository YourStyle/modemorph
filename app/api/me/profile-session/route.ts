// app/api/me/profile-session/route.ts
// API endpoint для получения профиля с session-based авторизацией

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  console.log("[Profile Session API] Request received, has token:", !!token)

  if (!token) {
    console.log("[Profile Session API] No authorization token")
    return NextResponse.json({ error: "No authorization token" }, { status: 401 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    })

    // Получаем пользователя по токену
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    console.log("[Profile Session API] User from token:", !!user, userError ? `Error: ${userError.message}` : "OK")

    if (userError || !user) {
      console.log("[Profile Session API] Invalid token or user error")
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Получаем профиль пользователя
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    console.log("[Profile Session API] Profile query result:", { hasData: !!data, error: error?.message })

    if (error) {
      console.log("[Profile Session API] Database error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.log("[Profile Session API] Returning profile data")
    return NextResponse.json({ profile: data, user })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "No authorization token" }, { status: 401 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    })

    // Получаем пользователя по токену
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Получаем данные из тела запроса
    const body = await req.json()

    // Проверяем существует ли профиль
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (existingProfile) {
      // Partial update: only update fields explicitly present in the request
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
      if (body.full_name !== undefined) updateData.full_name = body.full_name || null
      if (body.gender !== undefined) updateData.gender = body.gender || null
      if (body.height !== undefined) updateData.height = body.height ? Number.parseInt(body.height) : null
      if (body.weight !== undefined) updateData.weight = body.weight ? Number.parseInt(body.weight) : null
      if (body.top_size !== undefined) updateData.top_size = body.top_size || null
      if (body.bottom_size !== undefined) updateData.bottom_size = body.bottom_size || null
      if (body.shoe_size !== undefined) updateData.shoe_size = body.shoe_size ? Number.parseInt(body.shoe_size) : null
      if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url || null
      if (body.onboarding_complete !== undefined) updateData.onboarding_complete = body.onboarding_complete

      const { error } = await supabase
        .from("user_profiles")
        .update(updateData)
        .eq("user_id", user.id)

      if (error) throw error
    } else {
      // New profile: set all fields (missing ones default to null)
      const insertData = {
        user_id: user.id,
        full_name: body.full_name || null,
        gender: body.gender || null,
        height: body.height ? Number.parseInt(body.height) : null,
        weight: body.weight ? Number.parseInt(body.weight) : null,
        top_size: body.top_size || null,
        bottom_size: body.bottom_size || null,
        shoe_size: body.shoe_size ? Number.parseInt(body.shoe_size) : null,
        avatar_url: body.avatar_url || null,
        is_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from("user_profiles")
        .insert(insertData)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 })
  }
}