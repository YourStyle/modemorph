"use client"

import { useState } from "react"
import { toast } from "@/hooks/use-toast"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * "Войти через Яндекс" — starts the backend OAuth flow (GET /api/auth/yandex/start).
 *
 * The backend returns 501 when YANDEX_OAUTH_CLIENT_ID/SECRET aren't configured
 * (feature off). We can't easily read a redirect's status with a normal
 * navigation, so we probe first with `fetch(..., { redirect: "manual" })`:
 * a same-origin 3xx comes back as an opaque redirect (unreadable status, but
 * distinguishable from a normal response), while the 501 comes back readable.
 * On a redirect (or on any unexpected response) we just navigate for real —
 * only a confirmed 501 shows the toast. This is the simplest robust option
 * without adding a dedicated "is Yandex login enabled" endpoint.
 *
 * Visual: neutral outline pill (shared `buttonVariants({variant:"outline"})`,
 * same as the Telegram button) instead of Yandex's brand red fill — the app
 * has exactly one accent color (--signal) and Yandex's red nearly matched it.
 * The Yandex logo mark itself (white circle + red "Я") stays untouched.
 */
export function YandexLoginButton() {
  const [checking, setChecking] = useState(false)

  const handleClick = async () => {
    if (checking) return
    setChecking(true)
    try {
      const res = await fetch("/api/auth/yandex/start", { redirect: "manual" })
      if (res.type === "opaqueredirect" || res.status === 0) {
        window.location.href = "/api/auth/yandex/start"
        return
      }
      if (res.status === 501) {
        toast({
          title: "Недоступно",
          description: "Вход через Яндекс временно недоступен",
          variant: "destructive",
        })
        return
      }
      // Anything else (e.g. a normal 302 the browser didn't treat as opaque) — just navigate
      window.location.href = "/api/auth/yandex/start"
    } catch (error) {
      console.error("[YandexLogin] Failed to start OAuth flow:", error)
      toast({
        title: "Недоступно",
        description: "Вход через Яндекс временно недоступен",
        variant: "destructive",
      })
    } finally {
      setChecking(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={checking}
      className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full gap-2")}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="white" />
        <path
          d="M13.44 6.5h-1.36c-2.29 0-3.5 1.16-3.5 2.86 0 1.92 0.82 2.82 2.51 3.98l-2.78 4.16h1.83l2.5-3.77-0.9-0.6c-1.24-0.83-1.85-1.49-1.85-2.9 0-1.25 0.88-2.1 2.2-2.1h0.85v9.37h1.6V6.5z"
          fill="#FC3F1D"
        />
      </svg>
      <span>Войти через Яндекс</span>
    </button>
  )
}
