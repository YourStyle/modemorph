"use client"

import { useEffect, useState } from "react"
import { initTmaSafeArea } from "@/lib/tma/safe-area"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        platform?: string
        initData?: string
        initDataUnsafe?: Record<string, any>
      }
    }
  }
}

export function useTMA() {
  const [isTMA, setIsTMA] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkTMA = () => {
      try {
        const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
        const hasInit = !!(tg?.initData && tg.initData.trim().length > 0)
        const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
        const platformOk = !!tg?.platform && tg.platform !== "unknown"
        const inTMA = !!tg && hasInit && hasUser && platformOk

        setIsTMA(inTMA)
      } catch (error) {
        setIsTMA(false)
      } finally {
        setIsLoading(false)
      }
    }

    // Проверяем сразу
    checkTMA()

    // Проверяем через небольшую задержку на случай если Telegram WebApp еще не загрузился
    const timeout = setTimeout(checkTMA, 100)

    return () => clearTimeout(timeout)
  }, [])

  return { isTMA, isLoading }
}

/**
 * Single source of truth for the top safe-area inset in Telegram Mini Apps.
 * Mounts `initTmaSafeArea()` once (subscribes `--tg-top` on :root to
 * Telegram's `safeAreaInset`/`contentSafeAreaInset` + their change events)
 * and tears the subscription down on unmount. Call this once near the app
 * root (app/app/layout-client.tsx) — every other component just reads
 * `var(--tg-top, env(safe-area-inset-top, 0px))` from CSS, no need to call
 * this hook again or read window.Telegram directly.
 */
export function useTmaSafeArea() {
  useEffect(() => initTmaSafeArea(), [])
}

/**
 * True while running inside Telegram's mobile clients (iOS/Android), where
 * Telegram overlays its own header chrome on top of our content and the
 * app renders its own floating date/weather/avatar pill instead of the
 * desktop sticky header. Shared by layout-client.tsx (top padding) and
 * top-navigation.tsx (which header variant to render) so the two can never
 * disagree about which mode the app is in.
 */
export function useTmaMobile() {
  const [isTmaMobile, setIsTmaMobile] = useState(false)

  useEffect(() => {
    try {
      const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : undefined
      const hasInit = !!tg?.initData && String(tg.initData).trim().length > 0
      const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
      const platform = String(tg?.platform || "").toLowerCase()
      const inTma = hasInit && hasUser && platform && platform !== "unknown"
      if (inTma && /ios|android/.test(platform)) {
        setIsTmaMobile(true)
      }
    } catch {
      // игнорируем ошибки определения
    }
  }, [])

  return isTmaMobile
}
