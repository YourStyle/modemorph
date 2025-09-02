// app/api/auth/telegram/login-widget/route.ts
// Исправленная версия: корректная проверка подписи Login Widget,
// выравнивание env, «самовосстановление» пароля существующего пользователя через Admin API.
// Комментарии внутри. Без лишних объяснений.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

// --- ENV guard ---
function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}

// --- Telegram Login Widget signature (НЕ Mini App) ---
// secret = SHA256(botToken); HMAC-SHA256(data_check_string, secret) == hash
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

// --- TTL защиты для auth_date ---
function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && now - authDate <= maxAgeSec
}

// --- Детерминированный пароль для Telegram-аккаунтов ---
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

// --- Поиск пользователя по email через Admin API (пагинация) ---
async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  // auth.admin.listUsers({ page, perPage }) — перебор нескольких страниц
  const perPage = 1000
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await (admin as any).auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const hit = data?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (!data?.users?.length) break
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    // 1) Проверка env (важно: используем SUPABASE_SERVICE_ROLE, а не *_KEY)
    requireEnv(
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_PEPPER",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE",
    )

    // 2) Парсинг тела
    const { user } = await req.json()
    if (!user?.id || !user?.hash || !user?.auth_date) {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 })
    }

    // 3) Подпись и TTL
    if (!isValidTelegramLogin(user, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }
    if (!isFresh(Number(user.auth_date))) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 })
    }

    // 4) Подготовка учётки
    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), process.env.TELEGRAM_PEPPER!)

    // 5) Обычный клиент (anon) для входа
    const supabase = createClient()

    // 6) Пытаемся войти (если пользователь уже есть с корректным паролем)
    let { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (data?.session && !error) {
      return NextResponse.json({ success: true })
    }

    // 7) Админ-клиент для создания/починки пароля
    const admin = createClient({ role: "service" })

    // 7.1) Пробуем создать пользователя
    const createRes = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        provider: "telegram",
        telegram_id: user.id,
        telegram_username: user.username ?? null,
        telegram_first_name: user.first_name ?? null,
        telegram_last_name: user.last_name ?? null,
        telegram_photo_url: user.photo_url ?? null,
      },
    }).catch((e: any) => e)

    // 7.2) Если уже существует — обновляем пароль существующему пользователю
    if (createRes?.error || createRes?.name === "AuthApiError" || createRes?.status >= 400) {
      const existed = await findUserByEmail(admin, email)
      if (!existed) {
        return NextResponse.json({ error: "User exists but not found by email" }, { status: 500 })
      }
      const upd = await (admin as any).auth.admin.updateUserById(existed.id, { password })
      if (upd?.error) {
        return NextResponse.json({ error: upd.error?.message || "Password update failed" }, { status: 500 })
      }
    }

    // 8) Повторная попытка входа с детерминированным паролем
    const retry = await supabase.auth.signInWithPassword({ email, password })
    if (retry.error || !retry.data?.session) {
      return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server misconfigured" },
      { status: 500 }
    )
  }
}
