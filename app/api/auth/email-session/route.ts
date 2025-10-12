// app/api/auth/email-session/route.ts
// Session-based авторизация по email/паролю (вместо cookies)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init)
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  res.headers.set("Pragma", "no-cache")
  return res
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email: string = (body?.email || "").trim()
    const password: string = (body?.password || "").trim()

    if (!email || !password) {
      return jsonNoStore({ error: "Email and password are required" }, { status: 400 })
    }

    // Создаем Supabase клиент (используем anon key для логина)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !anonKey) {
      return jsonNoStore({ error: "Server misconfigured" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, anonKey)

    console.log("[Email Session API] Attempting sign in for:", email)

    // Логинимся через Supabase
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !signInData?.session || !signInData?.user) {
      console.error("[Email Session API] Sign in failed:", signInError?.message)
      return jsonNoStore(
        { error: signInError?.message || "Invalid credentials" },
        { status: 401 }
      )
    }

    console.log("[Email Session API] Sign in successful:", {
      user_id: signInData.user.id,
      expires_at: signInData.session.expires_at,
      expires_at_type: typeof signInData.session.expires_at
    })

    // Возвращаем session данные (НЕ устанавливаем cookies)
    return jsonNoStore({
      success: true,
      session: signInData.session,
      user: signInData.user
    })

  } catch (e: any) {
    console.error("[Email Session API] Unexpected error:", e)
    return jsonNoStore({ error: e?.message || "Server error" }, { status: 500 })
  }
}
