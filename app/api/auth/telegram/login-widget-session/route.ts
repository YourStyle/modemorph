// app/api/auth/telegram/login-widget-session/route.ts
// Session-based авторизация через Telegram Login Widget

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}

function isValidTelegramLogin(user: Record<string, any>, botToken: string) {
  const secret = crypto.createHash("sha256").update(botToken).digest()
  const dataCheckString = Object.keys(user)
    .filter((k) => k !== "hash" && user[k] != null)
    .sort()
    .map((k) => `${k}=${user[k]}`)
    .join("\n")
  const hmac = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex")
  return hmac === user.hash
}

function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && now - authDate <= maxAgeSec
}

function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init)
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  res.headers.set("Pragma", "no-cache")
  return res
}

export async function POST(req: NextRequest) {
  try {
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")

    const { user } = await req.json()
    if (!user?.id || !user?.hash || !user?.auth_date) {
      return jsonNoStore({ error: "Bad payload" }, { status: 400 })
    }

    // Проверяем подпись и срок действия
    if (!isValidTelegramLogin(user, process.env.TELEGRAM_BOT_TOKEN!)) {
      return jsonNoStore({ error: "Invalid Telegram signature" }, { status: 401 })
    }
    if (!isFresh(Number(user.auth_date))) {
      return jsonNoStore({ error: "Auth data expired" }, { status: 401 })
    }

    // Формируем учетные данные
    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), process.env.TELEGRAM_PEPPER!)

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "User"

    const metadata = {
      provider: "telegram",
      telegram_id: user.id,
      telegram_username: user.username ?? null,
      telegram_first_name: user.first_name ?? null,
      telegram_last_name: user.last_name ?? null,
      telegram_photo_url: user.photo_url ?? null,
      full_name: fullName || null,
    }

    // Создаем Supabase клиенты
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const anonClient = createClient(supabaseUrl, anonKey)
    const adminClient = createClient(supabaseUrl, serviceKey)

    // Пробуем войти
    const { data, error } = await anonClient.auth.signInWithPassword({ email, password })

    if (data?.session && !error) {
      // Обновляем профиль
      try {
        await adminClient.from("user_profiles").upsert(
          {
            user_id: data.user?.id ?? data.session?.user?.id,
            is_admin: false,
            full_name: fullName,
            avatar_url: user.photo_url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
      } catch {}

      console.log("[Login Widget Session] Existing user session created:", {
        expires_at: data.session.expires_at,
        user_id: data.user?.id
      })

      return jsonNoStore({
        success: true,
        session: data.session,
        user: data.user
      })
    }

    // Создаем нового пользователя
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    let userId = created?.user?.id

    // Если создание не удалось, ищем существующего пользователя
    if (!userId && createErr) {
      const { data: { users } } = await adminClient.auth.admin.listUsers()
      const existingUser = users.find(u => u.email === email)
      userId = existingUser?.id

      if (userId) {
        // Обновляем пароль и метаданные
        await adminClient.auth.admin.updateUserById(userId, {
          password,
          user_metadata: metadata,
        })
      }
    }

    if (!userId) {
      return jsonNoStore({ error: "Failed to create or find user" }, { status: 500 })
    }

    // Создаем профиль
    try {
      await adminClient.from("user_profiles").upsert(
        {
          user_id: userId,
          is_admin: false,
          full_name: fullName,
          avatar_url: user.photo_url ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
    } catch {}

    // Финальный логин
    const { data: retry, error: retryError } = await anonClient.auth.signInWithPassword({ email, password })

    if (retryError || !retry?.session) {
      return jsonNoStore({ error: "Auth failed after user creation" }, { status: 500 })
    }

    console.log("[Login Widget Session] New user session created:", {
      expires_at: retry.session.expires_at,
      user_id: retry.user?.id
    })

    return jsonNoStore({
      success: true,
      session: retry.session,
      user: retry.user
    })

  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Server misconfigured" }, { status: 500 })
  }
}