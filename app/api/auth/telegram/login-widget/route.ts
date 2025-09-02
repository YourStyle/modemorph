// app/api/auth/telegram/login-widget/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

function requireEnvAtLeastOne(...keys: string[]) {
  if (!keys.some((k) => !!process.env[k])) {
    throw new Error(`Missing env: one of [${keys.join(", ")}]`)
  }
}

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

export async function POST(req: NextRequest) {
  try {
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY")
    requireEnvAtLeastOne("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY")

    const { user } = await req.json()
    if (!user?.id || !user?.hash || !user?.auth_date) {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 })
    }

    if (!isValidTelegramLogin(user, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }
    if (!isFresh(Number(user.auth_date))) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 })
    }

    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), process.env.TELEGRAM_PEPPER!)

    const supabase = createClient()
    let { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (data?.session && !error) return NextResponse.json({ success: true })

    const admin = createClient({ role: "service" })

    // пробуем создать; при конфликте обновим пароль
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
    }).catch(() => ({ error: true }))

    if (createRes?.error) {
      // конфликт — обновляем пароль
      // listUsers не обязателен, если разрешена update по email:
      const { data: byEmail } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 200 })
      const existed = byEmail?.users?.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase())
      if (!existed?.id) {
        return NextResponse.json({ error: "Could not locate existing user by email" }, { status: 500 })
      }
      const upd = await (admin as any).auth.admin.updateUserById(existed.id, { password })
      if (upd?.error) {
        return NextResponse.json({ error: upd.error?.message || "Password update failed" }, { status: 500 })
      }
    }

    const retry = await supabase.auth.signInWithPassword({ email, password })
    if (retry.error || !retry.data?.session) {
      return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server misconfigured" }, { status: 500 })
  }
}
