"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { tmaHandshake } from "@/lib/tma/handshake"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        platform?: string
        version?: string
        colorScheme?: string
        initData?: string
        initDataUnsafe?: Record<string, any>
        isExpanded?: boolean
        viewportStableHeight?: number

        // events
        onEvent?: (event: string, cb: (...args: any[]) => void) => void
        offEvent?: (event: string, cb: (...args: any[]) => void) => void

        // lifecycle
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        isVersionAtLeast?: (ver: string) => boolean

        // NEW: жесты/закрытие
        enableClosingConfirmation?: () => void
        disableClosingConfirmation?: () => void
        enableVerticalSwipes?: () => void
        disableVerticalSwipes?: () => void

        // NEW: ярлык на Домой
        addToHomeScreen?: () => void
        checkHomeScreenStatus?: (cb?: (status: "unsupported"|"unknown"|"added"|"missed") => void) => void

        // NEW: кнопка «Настройки» в меню мини-аппа
        SettingsButton?: {
          show: () => void
          hide: () => void
          onClick?: (cb: () => void) => void
          offClick?: (cb: () => void) => void
          isVisible?: boolean
        }
      }
    }
  }
}

function detectTMA() {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const hasInit = !!(tg?.initData && tg.initData.trim().length > 0)
  const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
  const platformOk = !!tg?.platform && tg.platform !== "unknown"
  return { inTMA: !!tg && hasInit && hasUser && platformOk, tg }
}

function canRequestFullscreen(tg: NonNullable<typeof window.Telegram>["WebApp"]) {
  const p = (tg?.platform || "").toLowerCase()
  const desktop = p.includes("tdesktop") || p.includes("macos") || p.includes("linux") || p === "web"
  const apiOk = typeof tg?.isVersionAtLeast === "function" && tg.isVersionAtLeast("8.0")
  return apiOk && !desktop
}

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const onMiniReg = (pathname || "").startsWith("/auth/mini-registration")

  const supabase = useMemo(() => createClient(), [])
  const [ready, setReady] = useState(false)

  const [status, setStatus] = useState({ 
    isMiniApp: false, 
    fullscreenRequested: false, 
    fullscreenGranted: false, 
    platform: "-", 
    version: "-", 
  })


  const fsTried = useRef(false)
  const askFullscreen = (tg: NonNullable<typeof window.Telegram>["WebApp"]) => {
    if (fsTried.current) return
    fsTried.current = true
    if (!canRequestFullscreen(tg)) return
    try {
      tg.requestFullscreen?.()
    } catch {}
    try {
      tg.expand?.()
    } catch {}
    setStatus((s) => ({ ...s, fullscreenRequested: true }))
  }

    // --- helpers: Add to Home Screen в меню ---
  function setupAddToHomeInMenu(tg: NonNullable<typeof window.Telegram>["WebApp"]) {
    if (!tg.isVersionAtLeast?.("8.0")) return () => {} // не поддерживается
    const clickHandler = () => tg.addToHomeScreen?.()

    const show = () => {
      try {
        tg.SettingsButton?.show()
        tg.SettingsButton?.offClick?.(clickHandler)
        tg.SettingsButton?.onClick?.(clickHandler)
      } catch {}
    }
    const hide = () => {
      try {
        tg.SettingsButton?.offClick?.(clickHandler)
        tg.SettingsButton?.hide()
      } catch {}
    }

    // первичная проверка статуса
    try {
      tg.checkHomeScreenStatus?.((s) => {
        if (s === "added" || s === "unsupported") hide()
        else show()
      })
    } catch { show() }

    // поддерживаем актуальность по событиям клиента
    const onChecked = (payload: any) => {
      const s = typeof payload === "string" ? payload : payload?.status
      if (s === "added" || s === "unsupported") hide()
      else show()
    }
    const onAdded = () => hide()

    tg.onEvent?.("homeScreenChecked", onChecked)
    tg.onEvent?.("homeScreenAdded", onAdded)

    // cleanup
    return () => {
      tg.offEvent?.("homeScreenChecked", onChecked)
      tg.offEvent?.("homeScreenAdded", onAdded)
      tg.SettingsButton?.offClick?.(clickHandler)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const { inTMA, tg } = detectTMA()
        setStatus((s) => ({ ...s, isMiniApp: inTMA, platform: tg?.platform || "-", version: tg?.version || "-" }))

        if (!inTMA || !tg) {
          return // outside TMA — просто рендерим контент
        }

        // init TMA
        try {
          tg.ready()
          tg.setHeaderColor?.(tg.colorScheme === "dark" ? "secondary_bg_color" : "bg_color")
          tg.setBackgroundColor?.(tg.colorScheme === "dark" ? "#0e0e10" : "#ffffff")
        } catch {}

        askFullscreen(tg)
        const once = () => askFullscreen(tg)
        window.addEventListener("touchstart", once, { once: true, passive: true })
        window.addEventListener("click", once, { once: true })

        try { if (tg.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes?.() } catch {}

        // Подтверждение закрытия
        try { tg.enableClosingConfirmation?.() } catch {}

        // Пункт меню «Добавить на экран Домой»
        cleanupFns.push(setupAddToHomeInMenu(tg))

        // 1) Хэндшейк
        const user = await tmaHandshake()

        // 2) Если нет пользователя — пускаем на форму ТОЛЬКО если мы не на ней
        if (!user){ if (!onMiniReg) router.replace("/auth/mini-registration?from=tma"); return }

        // 3) Проверяем профиль
        const prof = await fetch("/api/me/profile", { credentials: "include" }).then(r => r.ok ? r.json() : null)
        const p = prof?.profile
        const required = ["gender","height","weight","top_size","bottom_size","shoe_size"]
        const missing = !p ? required : required.filter(k => p[k] == null || p[k] === "")
        if (missing.length > 0 && !onMiniReg) { router.replace("/auth/mini-registration?from=tma"); return }


        // 5) Всё ок — пропускаем детей
        return
      } finally {
        // КРИТИЧНО: никогда не держать экран серым
        if (!cancelled) setReady(true)
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [router, supabase, pathname])


  if (!ready) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }
  return (
    <>
      {children}
    </>
  )
}
