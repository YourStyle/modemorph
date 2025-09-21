// app/api/auth/telegram/miniapp-session/route.ts
// API endpoint для создания session-based авторизации вместо cookies

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

function requireEnv(...keys: string[]) {
  const miss = keys.filter(k => !process.env[k])
  if (miss.length) throw new Error(`Missing env: ${miss.join(", ")}`)
}

function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && Math.abs(now - authDate) <= maxAgeSec
}

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init)
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  res.headers.set("Pragma", "no-cache")
  return res
}

type ParsedInit = {
  entries: [string, string][],
  hash: string,
  authDate: number,
  user: any | null
}

function parseInitData(raw: string): ParsedInit {
  const url = new URL("https://dummy.local/?" + raw)
  const entries = Array.from(url.searchParams.entries())
  const hash = url.searchParams.get("hash") || ""
  const authDate = Number(url.searchParams.get("auth_date") || "0")
  const userStr = url.searchParams.get("user") || ""
  let user: any = null
  try { user = userStr ? JSON.parse(userStr) : null } catch {}
  return { entries, hash, authDate, user }
}

function makeDCS(entries: [string,string][], omitExtras = false) {
  const omit = new Set(["hash", ...(omitExtras ? ["signature"] : [])])
  return entries
    .filter(([k]) => !omit.has(k))
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join("\n")
}

function verifyInitData(raw: string, botToken: string) {
  const { entries, hash, authDate, user } = parseInitData(raw)
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()

  const variants = [ makeDCS(entries, false), makeDCS(entries, true) ]
  const ok = variants.some(dcs =>
    crypto.createHmac("sha256", secret).update(dcs).digest("hex") === hash
  )

  return { ok, authDate, user }
}

function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")

    const body = await req.json().catch(() => ({}))
    const rawInitData: string = (body?.initData || "").trim()
    if (!rawInitData) return jsonNoStore({ error: "No initData" }, { status: 400 })

    // 1) Проверяем initData
    const { ok, authDate, user: initUser } = verifyInitData(rawInitData, process.env.TELEGRAM_BOT_TOKEN!)
    if (!ok) return jsonNoStore({ error: "Invalid initData" }, { status: 401 })
    if (!isFresh(authDate)) return jsonNoStore({ error: "Init data expired" }, { status: 401 })

    // 2) Извлекаем данные пользователя
    const u = initUser || {}
    const tgId = String(u.id || "")
    if (!tgId) return jsonNoStore({ error: "No user in initData" }, { status: 400 })

    const email = `${tgId}@telegram.local`
    const password = derivedPassword(tgId, process.env.TELEGRAM_PEPPER!)
    const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "User"
    const metadata = {
      provider: "telegram-miniapp",
      telegram_id: tgId,
      telegram_username: u.username ?? null,
      telegram_first_name: u.first_name ?? null,
      telegram_last_name: u.last_name ?? null,
      telegram_photo_url: u.photo_url ?? null,
      full_name: fullName || null,
    }

    // 3) Создаем Supabase клиенты
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const anonClient = createClient(supabaseUrl, anonKey)
    const adminClient = createClient(supabaseUrl, serviceKey)

    // 4) Пробуем войти с существующими данными
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email, password })

    if (!signInError && signInData?.session && signInData?.user) {
      // Обновляем профиль
      try {
        await adminClient.from("user_profiles").upsert(
          {
            user_id: signInData.user.id,
            is_admin: false,
            full_name: fullName,
            avatar_url: u.photo_url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
      } catch {}

      return jsonNoStore({
        success: true,
        session: signInData.session,
        user: signInData.user
      })
    }

    // 5) Создаем нового пользователя
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    let userId = createData?.user?.id

    // 6) Если создание не удалось, ищем существующего пользователя
    if (!userId && createError) {
      const { data: { users } } = await adminClient.auth.admin.listUsers()
      const existingUser = users.find(user => user.email === email)
      userId = existingUser?.id

      if (userId) {
        // Обновляем пароль и метаданные существующего пользователя
        await adminClient.auth.admin.updateUserById(userId, {
          password,
          user_metadata: metadata,
        })
      }
    }

    if (!userId) {
      return jsonNoStore({ error: "Failed to create or find user" }, { status: 500 })
    }

    // 7) Создаем профиль
    try {
      await adminClient.from("user_profiles").upsert(
        {
          user_id: userId,
          is_admin: false,
          full_name: fullName,
          avatar_url: u.photo_url ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
    } catch {}

    // 8) Логинимся и возвращаем сессию
    const { data: finalSignIn, error: finalError } = await anonClient.auth.signInWithPassword({ email, password })

    if (finalError || !finalSignIn?.session) {
      return jsonNoStore({ error: "Auth failed after user creation" }, { status: 500 })
    }

    return jsonNoStore({
      success: true,
      session: finalSignIn.session,
      user: finalSignIn.user
    })

  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Server error" }, { status: 500 })
  }
}