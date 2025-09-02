// app/api/auth/telegram/login-widget/route.ts
// Полная проверка подписи Login Widget + защита по времени.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

function isValidTelegramLogin(user: Record<string, any>, botToken: string) {
  // 1) Секрет = SHA256(botToken)
  const secret = crypto.createHash("sha256").update(botToken).digest()

  // 2) data_check_string: все поля, кроме hash, в алфавитном порядке "key=value" через \n
  const dataCheckString = Object.keys(user)
    .filter((k) => k !== "hash" && user[k] !== undefined && user[k] !== null)
    .sort()
    .map((k) => `${k}=${user[k]}`)
    .join("\n")

  // 3) HMAC-SHA256(data_check_string, secret) в hex
  const hmac = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex")
  return hmac === user.hash
}

function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  // Рекомендуется проверять, что auth_date не старше суток (или вашего TTL)
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && now - authDate <= maxAgeSec
}

function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await req.json()
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
    const pepper = process.env.TELEGRAM_PEPPER

    if (!botToken || !pepper) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    // Проверка подписи Login Widget
    if (!isValidTelegramLogin(user, botToken)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }

    // Защита по времени (опционально, но желательно)
    const authDate = Number(user?.auth_date || 0)
    if (!isFresh(authDate, 24 * 60 * 60)) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 })
    }

    const supabase = createClient()
    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), pepper)

    // Пытаемся войти; если нет пользователя — создаём и входим
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !signInData?.session) {
      const admin = createClient({ role: "service" })
      await admin.auth.admin.createUser({
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
      })
      const retry = await supabase.auth.signInWithPassword({ email, password })
      if (retry.error || !retry.data?.session) {
        return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Auth error" }, { status: 500 })
  }
}
