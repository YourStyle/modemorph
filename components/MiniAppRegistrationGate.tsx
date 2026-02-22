"use client"

import { useEffect, useRef, type ReactNode } from "react"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        isVersionAtLeast?: (ver: string) => boolean
        disableVerticalSwipes?: () => void
        enableClosingConfirmation?: () => void
      }
    }
  }
}

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    // Initialize Telegram UI if available
    const tg = window.Telegram?.WebApp
    if (tg) {
      console.log("[MiniAppRegistrationGate] Initializing TG UI")
      try {
        tg.ready()
        tg.expand?.()
        // For TG Bot API 7.8+, request true fullscreen (needed for inline button launches)
        if (tg.isVersionAtLeast?.("7.8")) {
          tg.requestFullscreen?.()
        }
        tg.setHeaderColor?.("#FFFFFF")
        tg.setBackgroundColor?.("#0e0e10")
        tg.enableClosingConfirmation?.()
        if (tg.isVersionAtLeast?.("7.7")) {
          tg.disableVerticalSwipes?.()
        }
      } catch (e) {
        console.log("[MiniAppRegistrationGate] TG UI init error:", e)
      }
    }
  }, [])

  return <>{children}</>
}
