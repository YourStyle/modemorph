// app/api/auth/telegram/miniapp/route.ts
// Обмен initData Telegram Mini App → Supabase-сессия (создание/вход + метаданные).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

function requireEnv(...keys: string[]) {
  const missing = keys.filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}

// Проверка подписи initData (сырой querystring), секрет = SHA256(botToken)
function verifyInitData(raw: string, botToken: string) {
  const url = new URL("https://dummy.local/?" + raw)             // парсим как query
  const params = Array.from(url.searchParams.entries())
  const hash = url.searchParams.get("hash") || ""
  const dataPairs = params
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")

  const secret = crypto.createHash("sha256").update(botToken).digest()
  const hmac = crypto.createHmac("sha256", secret).update(dataPairs).digest("hex")
  return hmac === hash
}

function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY")
    if (!process.env.SUPABASE_SERVICE_ROLE && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing env: SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY")
    }

    // Принимаем либо raw initData, либо initDataUnsafe (как объект)
    const body = await req.json().catch(() => ({}))
    const rawInitData: string = body?.initData || ""
    const unsafe: any = body?.initDataUnsafe || null

    // Верификация подписи
    if (!rawInitData || !verifyInitData(rawInitData, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid initData" }, { status: 401 })
    }

    // Достаём полезные поля пользователя
    const u = unsafe?.user || {}
    const tgId = String(u.id || "")
    if (!tgId) return NextResponse.json({ error: "No user in initData" }, { status: 400 })

    const email = `${tgId}@telegram.local`
    const password = derivedPassword(tgId, process.env.TELEGRAM_PEPPER!)

    const fullName =
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.username ||
      "User"

    const metadata = {
      provider: "telegram-miniapp",
      telegram_id: tgId,
      telegram_username: u.username ?? null,
      telegram_first_name: u.first_name ?? null,
      telegram_last_name: u.last_name ?? null,
      telegram_photo_url: u.photo_url ?? null,
      full_name: fullName || null,
    }

    // anon-клиент — для входа
    const supabase = createClient()
    // service-клиент — для операций с пользователями и upsert профиля
    const admin = createClient({ role: "service" })

    // Пытаемся войти, если пользователь уже корректно настроен
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error && data?.session) {
        // апсерт профиля «на всякий случай»
        try {
          await (admin as any).from("user_profiles").upsert(
            {
              user_id: data.user?.id ?? data.session?.user?.id,
              is_admin: false,
              full_name: fullName,
              avatar_url: u.photo_url ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
        } catch {}
        return NextResponse.json({ success: true })
      }
    }

    // Создание пользователя (если нет) с метаданными
    const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    if (createErr && createErr.status !== 422 /* not "already registered" */) {
      return NextResponse.json({ error: createErr.message || "createUser failed" }, { status: 500 })
    }

    const userId =
      created?.user?.id ??
      (await (async () => {
        const url = `${process.env.SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
        const serviceRole = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
        const resp = await fetch(url, { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } })
        if (!resp.ok) return null
        const json = await resp.json().catch(() => null)
        const obj = Array.isArray(json) ? json[0] : json
        return obj?.id ?? null
      })())

    if (!userId) {
      return NextResponse.json({ error: "User lookup failed" }, { status: 500 })
    }

    // Обновляем метаданные и гарантируем пароль
    const upd = await (admin as any).auth.admin.updateUserById(userId, { password, user_metadata: metadata })
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "updateUser failed" }, { status: 500 })
    }

    // Апсерт профиля
    try {
      await (admin as any).from("user_profiles").upsert(
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

    // Вход и установка cookie
    const retry = await supabase.auth.signInWithPassword({ email, password })
    if (retry.error || !retry.data?.session) {
      return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}
