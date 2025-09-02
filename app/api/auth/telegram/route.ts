// app/api/auth/telegram/route.ts
import { NextResponse, NextRequest } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"
import { SupabaseClient } from "@supabase/supabase-js"

// Верификация HMAC из Telegram Login Widget / Mini App initData
function verifyTelegramAuth(initData: URLSearchParams, botToken: string): boolean {
  // Из initData убираем hash, остальные ключи сортируем и конкатенируем key=value с \n
  const dataCheckString = [...initData.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")

  // Секрет для HMAC: SHA256("WebAppData" + bot_token)
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

  return expectedHash === initData.get("hash")
}

// Детерминированный серверный пароль на основе telegram_id + PEPPER
function derivePassword(telegramId: string, pepper: string): string {
  // Никогда не логировать; длина ≥ 32
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

// Обеспечивает наличие пользователя в Supabase Auth и возвращает токены сессии
async function ensureSupabaseUserAndSignIn(
  admin: SupabaseClient, // с сервисным ключом
  anon: SupabaseClient,  // обычный клиент для signIn
  tg: { id: number; username?: string; first_name?: string; last_name?: string; photo_url?: string }
) {
  // Используем технический email-домейн для Telegram-аккаунтов
  const email = `${tg.id}@telegram.local`
  const password = derivePassword(String(tg.id), process.env.TELEGRAM_PEPPER!)

  // Пытаемся залогинить; если нет пользователя — создаём и потом логиним
  let signIn = await anon.auth.signInWithPassword({ email, password })
  if (signIn.error?.message?.toLowerCase().includes("invalid login") || !signIn.data?.session) {
    // Создание пользователя от имени админа (email_confirmed сразу true)
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        provider: "telegram",
        telegram_id: tg.id,
        telegram_username: tg.username ?? null,
        telegram_first_name: tg.first_name ?? null,
        telegram_last_name: tg.last_name ?? null,
        telegram_photo_url: tg.photo_url ?? null,
      },
    })
    // Повторный логин
    signIn = await anon.auth.signInWithPassword({ email, password })
  }
  if (signIn.error) throw signIn.error
  return signIn.data.session
}

export async function POST(req: NextRequest) {
  try {
    // initData может приходить либо как body JSON, либо как application/x-www-form-urlencoded
    const contentType = req.headers.get("content-type") || ""
    let initDataStr = ""
    if (contentType.includes("application/json")) {
      const body = await req.json()
      initDataStr = body?.initData || ""
    } else {
      const form = await req.formData()
      initDataStr = (form.get("initData") as string) || ""
    }

    // Пример: initData = "query_id=...&user=%7B...%7D&auth_date=...&hash=..."
    const initParams = new URLSearchParams(initDataStr)
    const botToken = process.env.TELEGRAM_BOT_TOKEN!
    if (!botToken) return NextResponse.json({ error: "Telegram bot token missing" }, { status: 500 })

    if (!verifyTelegramAuth(initParams, botToken)) {
      return NextResponse.json({ error: "Invalid Telegram initData" }, { status: 401 })
    }

    // user в initData — JSON-строка
    const tgUserRaw = initParams.get("user")
    if (!tgUserRaw) return NextResponse.json({ error: "No Telegram user" }, { status: 400 })

    const tgUser = JSON.parse(tgUserRaw) as {
      id: number
      username?: string
      first_name?: string
      last_name?: string
      photo_url?: string
    }

    // Клиенты Supabase
    const admin = createClient({ role: "service" }) // createClient должен уметь брать SERVICE_ROLE при role=service
    const anon = createClient()

    // Гарантируем юзера и получаем сессию (access/refresh)
    const session = await ensureSupabaseUserAndSignIn(admin, anon, tgUser)

    // Выставляем auth cookies
    const res = NextResponse.json({ success: true })
    // Устанавливаем куки, используя setSession на клиенте предпочтительно; но для SSR — кладём явно
    res.cookies.set("sb-access-token", session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60,
    })
    res.cookies.set("sb-refresh-token", session.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return res
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Telegram auth failed" }, { status: 500 })
  }
}
