// lib/tma/handshake.ts
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        initDataUnsafe?: { user?: { id?: number } } & Record<string, any>
      }
    }
  }
}

export async function tmaHandshake(): Promise<User | null> {
  const supabase = createClient()

  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""
  const tgUserId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null
  if (!initData || !tgUserId) {
    // Вне TMA или нет пользователя — просто вернём текущего юзера (если есть)
    try { return (await supabase.auth.getUser()).data.user ?? null } catch { return null }
  }

  // 1) Если уже есть пользователь и он тот же, что в TMA — ничего не делаем
  try {
    const { data } = await supabase.auth.getUser()
    const current = data.user
    const currentTgId = current?.user_metadata?.telegram_id || current?.app_metadata?.telegram_id
    if (current && String(currentTgId || "") === tgUserId) {
      return current
    }
  } catch {}

  // 2) Решаем, нужно ли принудительно чистить куки
  // Делать logout только ОДИН раз за жизненный цикл вкладки ИЛИ при конфликте пользователей
  const onceFlag = "tma:booted"
  const alreadyBooted = typeof sessionStorage !== "undefined" && sessionStorage.getItem(onceFlag) === "1"

  // Логаутим если:
  //  - есть конфликт пользователя (current != tgUserId), ИЛИ
  //  - это первый визит в TMA в этой вкладке (ещё не booted)
  if (!alreadyBooted) {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }) } catch {}
    try { sessionStorage.setItem(onceFlag, "1") } catch {}
  }

  // 3) Обмен initData на сессию
  const tryExchange = async () => {
    const res = await fetch("/api/auth/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
      credentials: "include",
    })
    if (!res.ok) return null
    // читаем текущего пользователя из supabase после обмена
    try { return (await supabase.auth.getUser()).data.user ?? null } catch { return null }
  }

  let user = await tryExchange()
  if (user) return user

  // 4) Если не получилось — ОДНОКРАТНО пробуем: logout → повторная попытка
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }) } catch {}
  user = await tryExchange()
  return user
}
