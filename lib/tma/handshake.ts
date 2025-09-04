// lib/tma/handshake.ts
// Унифицированный обмен initData → Supabase-сессия. Возвращает актуального user или null.

import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        initDataUnsafe?: Record<string, any>
      }
    }
  }
}

export async function tmaHandshake(): Promise<User | null> {
  const supabase = createClient()

  // 1) Если уже есть пользователь — просто вернём
   const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""
  if (!initData) return null

  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});


  try {
    const res = await fetch("/api/auth/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
      credentials: "include",
    })
    if (!res.ok) return null
  } catch {
    return null
  }

  // 3) Повторно читаем пользователя
  const me = await fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null)
  return me?.user ?? null
}
