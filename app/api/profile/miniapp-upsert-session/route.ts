// app/api/profile/miniapp-upsert-session/route.ts
// API endpoint для обновления профиля с session-based авторизацией

export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

    const body = await req.json()
    const payload = {
      user_id: user.id,
      gender: body.gender,
      height: Number(body.height),
      weight: Number(body.weight),
      top_size: body.top_size,
      bottom_size: body.bottom_size,
      shoe_size: Number.isFinite(Number(body.shoe_size)) ? Number(body.shoe_size) : body.shoe_size,
      referral: body.referral || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 })
  }
}