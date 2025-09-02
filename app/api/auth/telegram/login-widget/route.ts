// app/api/auth/telegram/login-widget/route.ts
// Надёжное создание/вход через Telegram Login Widget.
// При конфликте создаём/обновляем пароль существующему пользователю,
// используя REST Admin API фильтр по email (без перебора страниц).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"

// ---------- helpers ----------

// Требуем обязательные переменные
function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`)
}

// Требуем хотя бы одну из переменных
function requireEnvAtLeastOne(...keys: string[]) {
  if (!keys.some((k) => !!process.env[k])) {
    throw new Error(`Missing env: one of [${keys.join(", ")}]`)
  }
}

// Проверка подписи Login Widget: secret = SHA256(botToken)
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

// Защита по времени
function isFresh(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  return authDate > 0 && now - authDate <= maxAgeSec
}

// Детерминированный пароль
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex")
}

// Получение user.id по email через REST Admin API (точный фильтр по email)
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
    // Если 404 или пусто — вернём null; иначе пробросим ошибку для диагностики
    if (resp.status === 404) return null
    const txt = await resp.text().catch(() => "")
    throw new Error(`Admin REST get by email failed: ${resp.status} ${txt}`)
  }
  const json = await resp.json().catch(() => null)
  // Ответ может быть объектом пользователя или массивом; нормализуем
  const user = Array.isArray(json) ? json[0] : json
  return user?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    // Обязательные переменные
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY")
    // Поддержка обоих имён сервисного ключа
    requireEnvAtLeastOne("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY")

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabaseUrl = process.env.SUPABASE_URL!

    // Тело запроса
    const { user } = await req.json()
    if (!user?.id || !user?.hash || !user?.auth_date) {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 })
    }

    // Подпись и TTL
    if (!isValidTelegramLogin(user, process.env.TELEGRAM_BOT_TOKEN!)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 })
    }
    if (!isFresh(Number(user.auth_date))) {
      return NextResponse.json({ error: "Auth data expired" }, { status: 401 })
    }

    // Учётка
    const email = `${user.id}@telegram.local`
    const password = derivedPassword(String(user.id), process.env.TELEGRAM_PEPPER!)

    // anon клиент — для входа
    const supabase = createClient()
    // service клиент — для админ-операций
    const admin = createClient({ role: "service" })

    // Сначала пробуем войти (вдруг пароль уже корректный)
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (data?.session && !error) {
        return NextResponse.json({ success: true })
      }
    }

    // Пытаемся создать пользователя
    const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
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

    if (!createErr && created?.user?.id) {
      // Успешно создан — сразу входим
      const retry = await supabase.auth.signInWithPassword({ email, password })
      if (retry.error || !retry.data?.session) {
        return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    // Конфликт создания или другая ошибка — пробуем найти пользователя по email через REST и обновить пароль
    const userId = await getUserIdByEmailREST(supabaseUrl, serviceRole, email)
    if (!userId) {
      // Возвращаем детальное сообщение об ошибке создания
      return NextResponse.json(
        { error: `Could not locate existing user by email; createUser error: ${createErr?.message || "unknown"}` },
        { status: 500 }
      )
    }

    // Обновляем пароль существующему
    const upd = await (admin as any).auth.admin.updateUserById(userId, { password })
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "Password update failed" }, { status: 500 })
    }

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
