// app/api/auth/telegram/login-widget/route.ts
// Верификация Telegram Login Widget (НЕ Mini App).
// Секрет — bot token. Алгоритм: HMAC-SHA256(data_check_string, bot_token).

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

function isValidTelegramLogin(user: Record<string, any>, botToken: string) {
  // Формируем data_check_string из всех полей, кроме hash
  const dataPairs: string[] = []
  for (const [k, v] of Object.entries(user)) {
    if (k === "hash" || v === undefined || v === null) continue
    dataPairs.push(`${k}=${v}`)
  }
  dataPairs.sort()
  const dataCheckString = dataPairs.join("\n")

  // Вычисляем HMAC SHA256(data_check_string, botToken)
  const hmac = crypto.createHmac("sha256", botToken).update(dataCheckString).digest("hex")
  return hmac === user.hash
}

function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const user = body?.user || {}
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
    const pepper = process.env.TELEGRAM_PEPPER

    if (!botToken || !pepper) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }
    if (!isValidTelegramLogin(user, botToken)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }

    const supabase = createClient()
    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), pepper)

    // Pseudo: сначала пробуем войти, при ошибке — регистрируем и снова входим
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      const admin = createClient({ role: "service" }) // требует SUPABASE_SERVICE_ROLE на сервере
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
      const res2 = await supabase.auth.signInWithPassword({ email, password })
      signInData = res2.data
      signInError = res2.error
    }

    if (signInError || !signInData?.session) {
      return NextResponse.json({ error: signInError?.message || "Auth failed" }, { status: 400 })
    }

    // Отдаём success — куки расставит middleware Supabase (SSR), либо можно вручную
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Auth error" }, { status: 500 })
  }
}
