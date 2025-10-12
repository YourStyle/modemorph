// lib/tma/handshake.ts
// TMA авторизация через sessionStorage вместо cookies для Safari/iOS совместимости

import { sessionAuth } from "./session-auth"
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
  // Если handshake уже выполняется, ждем его результат
  if (handshakePromise) {
    console.log("[TMA Handshake] Handshake already in progress, waiting...")
    return await handshakePromise
  }

  console.log("[TMA Handshake] Starting handshake process")

  // Запускаем новый handshake
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
  // 1) Проверяем существующую сессию
  console.log("[TMA Handshake] Checking for existing session")
  if (sessionAuth.hasValidSession()) {
    const userId = sessionAuth.getUserId()
    if (userId) {
      console.log("[TMA Handshake] Using existing session for user:", userId)
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
    console.log("[TMA Handshake] Sending request to create session...")

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
      // 4) Сохраняем сессию в sessionStorage
      console.log("[TMA Handshake] Raw session data:", {
        expires_at: data.session.expires_at,
        expires_at_type: typeof data.session.expires_at
      })

      // Правильно парсим дату истечения
      let expiresAt: number
      if (typeof data.session.expires_at === 'number') {
        // Если это timestamp, проверяем в секундах или миллисекундах
        const timestamp = data.session.expires_at
        // Если timestamp меньше 2000000000 (примерно 2033 год), то это секунды
        expiresAt = timestamp < 2000000000 ? timestamp * 1000 : timestamp
      } else if (typeof data.session.expires_at === 'string') {
        // Если это строка ISO
        expiresAt = new Date(data.session.expires_at).getTime()
      } else {
        // Fallback - устанавливаем 1 час от текущего времени
        expiresAt = Date.now() + (60 * 60 * 1000)
        console.warn("[TMA Handshake] Unknown expires_at format, using fallback")
      }

      console.log("[TMA Handshake] Parsed expires_at:", new Date(expiresAt).toISOString())

      sessionAuth.saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        expires_at: expiresAt
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