// app/api/auth/telegram/miniapp/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

function requireEnv(...keys: string[]) {
  const missing = keys.filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}
function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && (now - authDate) <= maxAgeSec
}

type ParsedInit = {
  dataCheckString: string
  hash: string
  authDate: number
  user: any | null
}

function parseInitData(raw: string): ParsedInit {
  // НИЧЕГО не трогаем кроме парсинга query — важно сохранить точные значения
  const url = new URL("https://dummy.local/?" + raw)
  const entries = Array.from(url.searchParams.entries())

  const hash = url.searchParams.get("hash") || ""
  const authDate = Number(url.searchParams.get("auth_date") || "0")

  // user — это JSON-строка в query; берём её из initData, а не из тела запроса
  const userStr = url.searchParams.get("user") || ""
  let user: any = null
  try { user = userStr ? JSON.parse(userStr) : null } catch {}

  const dataCheckString = entries
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")

  return { dataCheckString, hash, authDate, user }
}

function verifyInitData(raw: string, botToken: string) {
  const { dataCheckString, hash, authDate, user } = parseInitData(raw)

  // ВАЖНО: секрет для Mini Apps — HMAC-SHA256(botToken, key="WebAppData")
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const hmac = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex")

  return { ok: hmac === hash, authDate, user }
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

    const body = await req.json().catch(() => ({}))
    const rawInitData: string = body?.initData || ""

    // 1) Верификация подписи + TTL
    const { ok, authDate, user: initUser } = verifyInitData(rawInitData, process.env.TELEGRAM_BOT_TOKEN!)
    if (!ok) return NextResponse.json({ error: "Invalid initData" }, { status: 401 })
    if (!isFresh(authDate)) return NextResponse.json({ error: "Init data expired" }, { status: 401 })

    // 2) Извлекаем пользователя из верифицированного initData
    const u = initUser || {}
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

    // anon-клиент — для входа; service — для админ операций
    const supabase = createClient()
    const admin = createClient({ role: "service" })

    // 3) Быстрый вход, если учётка уже согласована
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error && data?.session) {
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

    // 4) Создаём пользователя (или находим и обновляем)
    const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    let userId =
      created?.user?.id ??
      (await (async () => {
        if (createErr && createErr.status !== 422) return null
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

    const upd = await (admin as any).auth.admin.updateUserById(userId, { password, user_metadata: metadata })
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "updateUser failed" }, { status: 500 })
    }

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

    const retry = await supabase.auth.signInWithPassword({ email, password })
    if (retry.error || !retry.data?.session) {
      return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}
