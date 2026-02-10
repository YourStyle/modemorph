// lib/tma/handshake.ts
// TMA авторизация через sessionStorage вместо cookies для Safari/iOS совместимости

import { sessionAuth } from "./session-auth"
import { parseSupabaseExpiry } from "@/lib/auth-utils"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"

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

// Предотвращаем множественные одновременные вызовы
let handshakePromise: Promise<TMAUser | null> | null = null

export async function tmaHandshake(): Promise<TMAUser | null> {
  if (handshakePromise) {
    return await handshakePromise
  }

  handshakePromise = performHandshake()

  try {
    const result = await handshakePromise
    return result
  } finally {
    // Очищаем promise после завершения
    handshakePromise = null
  }
}

async function performHandshake(): Promise<TMAUser | null> {
  // 1) Check existing session
  if (sessionAuth.hasValidSession()) {
    const userId = sessionAuth.getUserId()
    if (userId) {
      return { id: userId, telegram_id: userId }
    }
  }

  // 2) Get initData from Telegram WebApp
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""

  if (!initData) return null

  try {
    // 3) Create session from initData
    const response = await fetchWithRetry(
      "/api/auth/telegram/miniapp-session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
        cache: "no-store",
      },
      {
        timeout: 15000,  // 15 секунд для создания сессии
        retries: 2,      // 2 повторные попытки
        retryDelay: 1000,
        backoff: true
      }
    )

    if (!response.ok) {
      const error = await response.text().catch(() => "Unknown error")
      console.error("[TMA Handshake] Session creation failed:", error)
      return null
    }

    const data = await response.json()

    if (data.session && data.user) {
      sessionAuth.saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        expires_at: parseSupabaseExpiry(data.session.expires_at)
      })

      return {
        id: data.user.id,
        telegram_id: data.user.user_metadata?.telegram_id || data.user.id,
        full_name: data.user.user_metadata?.full_name,
        avatar_url: data.user.user_metadata?.telegram_photo_url
      }
    }

    return null
  } catch (error) {
    if (error instanceof NetworkError) {
      console.error("[TMA Handshake] Network error:", error.message, { isOffline: error.isOffline })
    } else if (error instanceof TimeoutError) {
      console.error("[TMA Handshake] Timeout error:", error.message)
    } else {
      console.error("[TMA Handshake] Unexpected error:", error)
    }
    return null
  }
}