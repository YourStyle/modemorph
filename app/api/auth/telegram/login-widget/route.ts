// app/api/auth/telegram/login-widget/route.ts
export const runtime = "nodejs"           // нужен Node, а не Edge (иначе env может быть пустым)
export const dynamic = "force-dynamic"    // на всякий случай, чтобы env читались на каждом запросе

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"

function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`)
  }
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

function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    // жёсткая проверка env во время запроса
    requireEnv(
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_PEPPER",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY"
    )
    if (!isSupabaseConfigured) throw new Error("Supabase not configured")

    const { user } = await req.json()
    if (!isValidTelegramLogin(user, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }

    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), process.env.TELEGRAM_PEPPER!)

    const supabase = createClient()
    let { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.session) {
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
    return NextResponse.json(
      { error: e?.message || "Server misconfigured" },
      { status: 500 }
    )
  }
}
