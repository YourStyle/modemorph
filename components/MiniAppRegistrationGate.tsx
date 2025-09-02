// components/MiniAppRegistrationGate.tsx
// Обновлённая логика: если внутри TMA и (нет user ИЛИ профиль неполный) — всегда редирект на /auth/mini-registration.
// Fullscreen запрашиваем только на мобильных клиентах с API ≥ 8.0. Desktop/web не трогаем.

"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
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
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        isVersionAtLeast?: (ver: string) => boolean
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

interface Props { children: ReactNode }

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const onMiniReg = (pathname || "").startsWith("/auth/mini-registration")

  const supabase = useMemo(() => createClient(), [])
  const [ready, setReady] = useState(false)

  // debug
  const [dbgOn, setDbgOn] = useState(false)
  const [status, setStatus] = useState({
    isMiniApp: false,
    fullscreenRequested: false,
    fullscreenGranted: false,
    platform: "-",
    version: "-",
  })

  useEffect(() => {
    const env = (process.env.NEXT_PUBLIC_TMA_DEBUG || "") === "1"
    const q = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tma_debug") === "1"
    setDbgOn(env || q)
  }, [])

  const fsTried = useRef(false)
  const askFullscreen = (tg: NonNullable<typeof window.Telegram>["WebApp"]) => {
    if (fsTried.current) return
    fsTried.current = true
    if (!canRequestFullscreen(tg)) return
    try { tg.requestFullscreen?.() } catch {}
    try { tg.expand?.() } catch {}
    setStatus(s => ({ ...s, fullscreenRequested: true }))
  }

   useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const { inTMA, tg } = detectTMA()
        setStatus(s => ({ ...s, isMiniApp: inTMA, platform: tg?.platform || "-", version: tg?.version || "-" }))

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

        // 1) Хэндшейк
        const user = await tmaHandshake()

        // 2) Если нет пользователя — пускаем на форму ТОЛЬКО если мы не на ней
        if (!user) {
          if (!onMiniReg) router.replace("/auth/mini-registration?from=tma")
          return
        }

        // 3) Проверяем профиль
        const { data: profile, error } = await supabase
          .from("user_profiles")
          .select("gender,height,weight,top_size,bottom_size,shoe_size")
          .eq("user_id", user.id)
          .maybeSingle() // безопаснее, чем .single()

        const required = ["gender","height","weight","top_size","bottom_size","shoe_size"]
        const missing = error || !profile
          ? required
          : required.filter(k => {
              const v = (profile as any)[k]
              return v === null || v === undefined || v === ""
            })

        // 4) Если профиль неполный — редиректим только с других страниц
        if (missing.length > 0) {
          if (!onMiniReg) router.replace("/auth/mini-registration?from=tma")
          return
        }

        // 5) Всё ок — пропускаем детей
        return
      } finally {
        // КРИТИЧНО: никогда не держать экран серым
        if (!cancelled) setReady(true)
      }
    }

    boot()
    return () => { cancelled = true }
  }, [router, supabase, pathname])

  const Debug = () =>
    !dbgOn ? null : (
      <div className="tma-debug">
        <div className="tma-debug__row">
          <b>TMA Debug</b>
          <button className="tma-debug__btn" onClick={() => setDbgOn(false)}>hide</button>
        </div>
        <div className="tma-debug__grid">
          <div>isMiniApp: <b>{String(status.isMiniApp)}</b></div>
          <div>platform: <b>{status.platform}</b></div>
          <div>version: <b>{status.version}</b></div>
          <div>fullscreenRequested: <b>{String(status.fullscreenRequested)}</b></div>
          <div>fullscreenGranted: <b>{String(status.fullscreenGranted)}</b></div>
        </div>
      </div>
    )

if (!ready) {
      return (
        <main className="mx-auto max-w-xl px-4 py-6 text-sm text-muted-foreground">
          Подготавливаем форму…
        </main>
      )
}
  return (
    <>
      {children}
      <Debug />
    </>
  )
}
