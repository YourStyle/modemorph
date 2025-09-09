// app/api/auth/telegram/login-widget/route.ts
// Надёжное создание/вход через Telegram Login Widget + прокидывание full_name и avatar_url из Telegram.
// Использует Admin REST-поиск по email (без перебора страниц) при конфликте.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

// --- helpers ---

// Требуем наличие переменных окружения
function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}

// Требуем наличие хотя бы одной из переменных
function requireEnvAtLeastOne(...keys: string[]) {
  if (!keys.some((k) => !!process.env[k])) {
    throw new Error(`Missing env: one of [${keys.join(", ")}]`)
  }
}

// Проверка подписи Login Widget: secret = SHA256(botToken); HMAC-SHA256(data_check_string, secret) == hash
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

// TTL-проверка auth_date
function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && now - authDate <= maxAgeSec
}

// Детерминированный пароль на основе telegram_id
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

// Поиск user.id по email через Admin REST API (точный фильтр по email)
async function getUserIdByEmailREST(
  supabaseUrl: string,
  serviceRole: string,
  email: string
): Promise<string | null> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
  if (!resp.ok) {
    if (resp.status === 404) return null
    const txt = await resp.text().catch(() => "")
    throw new Error(`Admin REST get by email failed: ${resp.status} ${txt}`)
  }
  const json = await resp.json().catch(() => null)
  const user = Array.isArray(json) ? json[0] : json
  return user?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    // Обязательные переменные окружения
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY")
    // Поддержка обоих имён для сервисного ключа
    requireEnvAtLeastOne("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY")

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseUrl = process.env.SUPABASE_URL!

    // Тело запроса
    const { user } = await req.json()
    if (!user?.id || !user?.hash || !user?.auth_date) {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 })
    }

    // Проверка подписи и срока действия
    if (!isValidTelegramLogin(user, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }
    if (!isFresh(Number(user.auth_date))) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 })
    }

    // Формирование учётных данных
    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), process.env.TELEGRAM_PEPPER!)

    // Имя и аватар из Telegram
    const fullName =
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username ||
      "User"

    const metadata = {
      provider: "telegram",
      telegram_id: user.id,
      telegram_username: user.username ?? null,
      telegram_first_name: user.first_name ?? null,
      telegram_last_name: user.last_name ?? null,
      telegram_photo_url: user.photo_url ?? null,
      full_name: fullName || null,
    }

    // anon-клиент — для входа
    const supabase = await createClient()
    // service-клиент — для админ-операций и upsert профиля
    const admin = await createClient({ role: "service" })

    // Пробуем мгновенно войти (если учётка уже согласована ранее)
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (data?.session && !error) {
        // На всякий случай синхронизируем профиль (не критично при наличии триггера)
        try {
          await (admin as any).from("user_profiles").upsert(
            {
              user_id: data.user?.id ?? data.session?.user?.id,
              is_admin: false,
              full_name: fullName,
              avatar_url: user.photo_url ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
        } catch {}
        return NextResponse.json({ success: true })
      }
    }

    // Создаём пользователя с метаданными (имя/аватар)
    const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    if (!createErr && created?.user?.id) {
      // Апсертим профиль сразу (избыточно, но ускоряет появление имени/аватара)
      try {
        await (admin as any).from("user_profiles").upsert(
          {
            user_id: created.user.id,
            is_admin: false,
            full_name: fullName,
            avatar_url: user.photo_url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
      } catch {}
      // Входим
      const retry = await supabase.auth.signInWithPassword({ email, password })
      if (retry.error || !retry.data?.session) {
        return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    // Конфликт/ошибка создания — ищем пользователя по email и обновляем пароль и метаданные
    const userId = await getUserIdByEmailREST(supabaseUrl, serviceRole, email)
    if (!userId) {
      return NextResponse.json(
        { error: `Could not locate existing user by email; createUser error: ${createErr?.message || "unknown"}` },
        { status: 500 }
      )
    }

    // Обновление пароля и метаданных существующему пользователю
    const upd = await (admin as any).auth.admin.updateUserById(userId, {
      password,
      user_metadata: metadata,
    })
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "Password/metadata update failed" }, { status: 500 })
    }

    // Апсерт профиля (с именем и аватаром)
    try {
      await (admin as any).from("user_profiles").upsert(
        {
          user_id: userId,
          is_admin: false,
          full_name: fullName,
          avatar_url: user.photo_url ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
    } catch {}

    // Повторный вход
    const retry2 = await supabase.auth.signInWithPassword({ email, password })
    if (retry2.error || !retry2.data?.session) {
      return NextResponse.json({ error: retry2.error?.message || "Auth failed" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server misconfigured" }, { status: 500 })
  }
}
