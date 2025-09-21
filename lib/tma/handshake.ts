// lib/tma/handshake.ts
// TMA авторизация через sessionStorage вместо cookies для Safari/iOS совместимости

import { sessionAuth } from "./session-auth"

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

export interface TMAUser {
  id: string
  telegram_id: string
  full_name?: string
  avatar_url?: string
}

export async function tmaHandshake(): Promise<TMAUser | null> {
  // 1) Проверяем существующую сессию
  if (sessionAuth.hasValidSession()) {
    const userId = sessionAuth.getUserId()
    if (userId) {
      console.log("[TMA Handshake] Using existing session")
      return { id: userId, telegram_id: userId }
    }
  }

  // 2) Получаем initData из Telegram WebApp
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""

  if (!initData) {
    console.log("[TMA Handshake] No initData available")
    return null
  }

  console.log("[TMA Handshake] Creating new session from initData")

  try {
    // 3) Отправляем initData на сервер для создания сессии
    const response = await fetch("/api/auth/telegram/miniapp-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
      cache: "no-store",
    })

    if (!response.ok) {
      const error = await response.text().catch(() => "Unknown error")
      console.error("[TMA Handshake] Session creation failed:", error)
      return null
    }

    const data = await response.json()

    if (data.session && data.user) {
      // 4) Сохраняем сессию в sessionStorage
      sessionAuth.saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        expires_at: new Date(data.session.expires_at).getTime()
      })

      console.log("[TMA Handshake] Session created successfully")
      return {
        id: data.user.id,
        telegram_id: data.user.user_metadata?.telegram_id || data.user.id,
        full_name: data.user.user_metadata?.full_name,
        avatar_url: data.user.user_metadata?.telegram_photo_url
      }
    }

    return null
  } catch (error) {
    console.error("[TMA Handshake] Error:", error)
    return null
  }
}