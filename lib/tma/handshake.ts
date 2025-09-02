// lib/tma/handshake.ts
// Обновление: если API вернул session, устанавливаем её на клиенте сразу.

import { createClient } from "@/lib/supabase/client"

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; initDataUnsafe?: Record<string, any> } }
  }
}

export async function tmaHandshake() {
  const supabase = createClient()

  // Уже авторизован
  try {
    const { data } = await supabase.auth.getUser()
    if (data.user) return data.user
  } catch {}

  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""
  if (!initData) return null

  try {
    const res = await fetch("/api/auth/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
      credentials: "include",
    })
    if (!res.ok) return null

    const js = await res.json().catch(() => ({}))
    if (js?.session?.access_token && js?.session?.refresh_token) {
      // Проставляем сессию в клиентском supabase
      await supabase.auth.setSession({
        access_token: js.session.access_token,
        refresh_token: js.session.refresh_token,
      })
    }
  } catch {
    return null
  }

  try {
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
  } catch {
    return null
  }
}
