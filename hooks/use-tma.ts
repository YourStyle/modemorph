"use client"

import { useEffect, useState } from "react"

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
