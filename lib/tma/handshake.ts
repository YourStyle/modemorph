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
  try {
    const { data } = await supabase.auth.getUser()
    if (data.user) return data.user
  } catch {}

  // 2) Иначе пытаемся обменять initData на сессию
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""
  const initDataUnsafe = tg?.initDataUnsafe || {}

  if (!initData) return null

  try {
    const res = await fetch("/api/auth/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, initDataUnsafe }),
      credentials: "include",
    })
    if (!res.ok) return null
  } catch {
    return null
  }

  // 3) Повторно читаем пользователя
  try {
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
  } catch {
    return null
  }
}
