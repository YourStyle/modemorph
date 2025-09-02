// app/api/auth/telegram/miniapp/route.ts
// Верификация Telegram Mini App initData (ИМЕННО строкой), создание/вход в Supabase.
// Возвращает access/refresh токены, чтобы клиент установил сессию через supabase.auth.setSession.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

// ————— utils —————

// Требуем обязательные переменные окружения
function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}

// Разрешаем оба имени сервисного ключа
function getServiceRole(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!v) throw new Error("Missing env: SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY")
  return v
}

// Проверка TTL auth_date (по умолчанию — 24 часа)
function isFresh(authDate: string | number, maxAgeSec = 86400) {
  const ts = typeof authDate === "string" ? parseInt(authDate, 10) : Math.trunc(authDate)
  if (!Number.isFinite(ts) || ts <= 0) return false
  const now = Math.floor(Date.now() / 1000)
  return now - ts <= maxAgeSec && now >= ts - 300 // допускаем до 5 минут вперёд по часам клиента
}

// Верификация initData (строка из Telegram.WebApp.initData)
function verifyInitData(initData: string, botToken: string) {
  // Парсим query-string без игнорирования «лишних» полей. ВКЛЮЧАЯ signature.
  const params = new URLSearchParams(initData)

  const hash = params.get("hash")
  if (!hash) return { ok: false as const, reason: "hash missing" }

  // Сборка data_check_string: сортируем ключи по алфавиту, исключая "hash".
  const entries: Array<[string, string]> = []
  params.forEach((value, key) => {
    if (key !== "hash") entries.push([key, value])
  })
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n")

  // secret_key = SHA256(bot_token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest()
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

  if (hmac !== hash) return { ok: false as const, reason: "hmac mismatch" }

  const auth_date = params.get("auth_date") || ""
  if (!isFresh(auth_date)) return { ok: false as const, reason: "stale auth_date" }

  // user — строка JSON в initData; для дальнейшей логики распарсим аккуратно
  let userUnsafe: any = null
  try {
    const raw = params.get("user")
    if (raw) userUnsafe = JSON.parse(raw)
  } catch {
    // допустимо, если Telegram не прислал user (например, web launch с query_id)
  }

  return {
    ok: true as const,
    params,
    userUnsafe,
  }
}

// Детерминированный пароль из telegram_id
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

// Поиск пользователя по email через REST Admin API (точный фильтр, без пагинации)
async function getUserIdByEmailREST(supabaseUrl: string, serviceRole: string, email: string) {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
  const resp = await fetch(url, {
    method: "GET",
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  })
  if (resp.status === 404) return null
  if (!resp.ok) {
    const t = await resp.text().catch(() => "")
    throw new Error(`Admin REST failed: ${resp.status} ${t}`)
  }
  const js = await resp.json().catch(() => null)
  const user = Array.isArray(js) ? js[0] : js
  return user?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    // Обязательные env
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY")
    const serviceRole = getServiceRole()

    const { initData } = await req.json()

    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ error: "initData is required" }, { status: 400 })
    }

    // Верификация initData «как строка». НЕ используем initDataUnsafe для проверки подписи.
    const vr = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN!)
    if (!vr.ok) {
      return NextResponse.json({ error: "Invalid initData", reason: vr.reason }, { status: 401 })
    }

    // Извлекаем user
    const tgUser = vr.userUnsafe || {}
    const tgId = String(tgUser.id || "")
    if (!tgId) {
      // В редких сценариях Telegram может не прислать user (есть только query_id).
      // В таком случае не имеем уникального идентификатора для аккаунта.
      return NextResponse.json({ error: "No user in initData" }, { status: 400 })
    }

    const email = `${tgId}@telegram.local`
    const password = derivedPassword(tgId, process.env.TELEGRAM_PEPPER!)

    // Поля для метадаты
    const username = tgUser.username || null
    const firstName = tgUser.first_name || ""
    const lastName = tgUser.last_name || ""
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || username || `tg_${tgId}`
    const avatarUrl = tgUser.photo_url || null

    // anon и admin клиенты
    const supabase = createClient()
    const admin = createClient({ role: "service" }) as any

    // 1) Пытаемся войти сразу (если уже создан и пароль совпадает)
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error && data?.session) {
        return NextResponse.json({
          success: true,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        })
      }
    }

    // 2) Пробуем создать нового пользователя
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        provider: "telegram",
        telegram_id: tgId,
        telegram_username: username,
        full_name: fullName,
        avatar_url: avatarUrl,
      },
    })

    if (!createErr && created?.user?.id) {
      // Входим и возвращаем токены клиенту (он установит сессию локально)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error && data?.session) {
        return NextResponse.json({
          success: true,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        })
      }
      return NextResponse.json({ error: "Auth failed after create" }, { status: 400 })
    }

    // 3) Конфликт/ошибка: ищем пользователя по email и обновляем пароль
    const userId = await getUserIdByEmailREST(process.env.SUPABASE_URL!, serviceRole, email)
    if (!userId) {
      return NextResponse.json(
        { error: `Could not locate existing user by email; createUser error: ${createErr?.message || "unknown"}` },
        { status: 500 }
      )
    }

    const upd = await admin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: {
        provider: "telegram",
        telegram_id: tgId,
        telegram_username: username,
        full_name: fullName,
        avatar_url: avatarUrl,
      },
    })
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "Password update failed" }, { status: 500 })
    }

    // Повторный вход и возврат токенов
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data?.session) {
      return NextResponse.json({
        success: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      })
    }

    return NextResponse.json({ error: "Auth failed" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}
