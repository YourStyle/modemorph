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
        onEvent?: (event: string, cb: (...args: any[]) => void) => void
        offEvent?: (event: string, cb: (...args: any[]) => void) => void
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        isVersionAtLeast?: (ver: string) => boolean
        enableClosingConfirmation?: () => void
        disableClosingConfirmation?: () => void
        enableVerticalSwipes?: () => void
        disableVerticalSwipes?: () => void
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

  // ⬇️ добавлено: защита от двойной инициализации/редиректа
  const initCalledRef = useRef(false)
  const redirectedRef = useRef(false)
  const safeRedirect = (to: string) => {
    if (redirectedRef.current) return
    redirectedRef.current = true
    router.replace(to)
  }

  const fsTried = useRef(false)
  const askFullscreen = (tg: NonNullable<typeof window.Telegram>["WebApp"]) => {
    if (fsTried.current) return
    fsTried.current = true
    if (!canRequestFullscreen(tg)) return
    try { tg.requestFullscreen?.() } catch {}
    try { tg.expand?.() } catch {}
  }

  useEffect(() => {
    // ⬇️ добавлено: не запускаем повторно при смене pathname и т.п.
    if (initCalledRef.current) return
    initCalledRef.current = true

    let cancelled = false
    let redirecting = false

    async function boot() {
      try {
        const { inTMA, tg } = detectTMA()

        if (!inTMA || !tg) {
          return // outside TMA — просто рендерим контент
        }

        // init TMA
        try {
          tg.ready()
          const c = "#FFFFFF"
          const bgC = "#0e0e10"
          tg.setHeaderColor?.(c)
          tg.setBackgroundColor?.(bgC)
          document.body.style.backgroundColor = c
        } catch {}

        askFullscreen(tg)
        const once = () => askFullscreen(tg)
        window.addEventListener("touchstart", once, { once: true, passive: true })
        window.addEventListener("click", once, { once: true })

        try { if (tg.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes?.() } catch {}

        // Подтверждение закрытия
        try { tg.enableClosingConfirmation?.() } catch {}

        // 1) Хэндшейк
        const user = await tmaHandshake()

        // 2) Если нет пользователя — пускаем на форму ТОЛЬКО если мы не на ней
        if (!user) {
          if (!onMiniReg) {
            redirecting = true
            setReady(true)
            safeRedirect("/auth/mini-registration?from=tma")
          }
          return
        }

        // 3) Проверяем профиль
        const prof = await fetch("/api/me/profile", { credentials: "include" }).then(r => r.ok ? r.json() : null)
        const p = prof?.profile
        const required = ["gender","height","weight","top_size","bottom_size","shoe_size"]
        const missing = !p ? required : required.filter(k => p[k] == null || p[k] === "")
        if (missing.length > 0 && !onMiniReg) {
          redirecting = true
          setReady(true)
          safeRedirect("/auth/mini-registration?from=tma")
          return
        }

        // ⬇️ добавлено: если уже всё ок — отправим в цель по роли
        // (домашняя страница тоже разрулит, но это убирает «мигание» на `/`)
        // ожидаем, что бек кладёт флаг is_admin в профиле
        const target = p?.is_admin ? "/admin" : "/app"
        if (!onMiniReg && (pathname === "/" || pathname.startsWith("/auth/"))) {
          redirecting = true
          setReady(true)
          safeRedirect(target)
          return
        }

        // Всё ок — пропускаем детей
        return
      } finally {
        if (!cancelled && !redirecting) setReady(true);
      }
    }

    boot()
    return () => {
      cancelled = true
    }
    // оставляю твои зависимости (но защищаемся initCalledRef)
  }, [router, supabase, pathname, onMiniReg])

  if (!ready) {
    return (
      <div className="fixed inset-0 bg-[#f9fafb]/50 flex items-center justify-center">
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
