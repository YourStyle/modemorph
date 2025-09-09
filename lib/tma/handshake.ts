// lib/tma/handshake.ts
import type { User } from "@supabase/supabase-js"

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string } }
  }
}

let inflight: Promise<User | null> | null = null
let lastInitData = ""

export async function tmaHandshake(): Promise<User | null> {
  // 0) если сессия уже есть — не трогаем куки
  try {
    const me = await fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
    if (me?.user) return me.user as User
  } catch {}

  const initData = typeof window !== "undefined" ? (window.Telegram?.WebApp?.initData || "") : ""
  if (!initData) return null

  // 1) дедупликация параллельных вызовов
  if (inflight && initData === lastInitData) return inflight

  lastInitData = initData
  inflight = (async () => {
    const res = await fetch("/api/auth/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
      credentials: "include",
    })
    if (!res.ok) return null

    const me2 = await fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
    return me2?.user ?? null
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}
