// components/MiniAppRegistrationGate.tsx
"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        // базовые поля
        platform?: string
        version?: string
        colorScheme?: string
        initData?: string
        initDataUnsafe?: Record<string, any>

        // размеры/события
        isExpanded?: boolean
        viewportStableHeight?: number
        onEvent?: (event: string, cb: (...args: any[]) => void) => void

        // методы
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
  // Desktop (tdesktop/macos/linux/web) полноэкранный режим не всегда поддерживает.
  const p = (tg?.platform || "").toLowerCase()
  const desktop = p.includes("tdesktop") || p.includes("macos") || p.includes("linux") || p === "web"
  const apiOk = typeof tg?.isVersionAtLeast === "function" && tg.isVersionAtLeast("8.0")
  return apiOk && !desktop
}

interface Props { children: ReactNode }

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [ready, setReady] = useState(false)

  // debug-виджет
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

  // ——— безопасный запрос fullscreen
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
    async function boot() {
      const { inTMA, tg } = detectTMA()
      setStatus(s => ({
        ...s,
        isMiniApp: inTMA,
        platform: tg?.platform || "-",
        version: tg?.version || "-",
      }))

      if (!inTMA || !tg) {
        setReady(true)
        return
      }

      // инициализация + базовые цвета
      try {
        tg.ready()
        tg.setHeaderColor?.(tg.colorScheme === "dark" ? "secondary_bg_color" : "bg_color")
        tg.setBackgroundColor?.(tg.colorScheme === "dark" ? "#0e0e10" : "#ffffff")
      } catch {}

      // корректная высота даже без fullscreen
      document.documentElement.style.setProperty("--tma-safe", "env(safe-area-inset-bottom)")

      // подписки на viewport (даёт «почти fullscreen» через CSS-переменные)
      tg.onEvent?.("viewportChanged", () => {
        const granted = !!tg.isExpanded || (tg.viewportStableHeight || 0) >= (window.innerHeight - 1)
        setStatus(s => ({ ...s, fullscreenGranted: granted }))
      })

      // запрос fullscreen — только на поддерживаемых мобильных клиентах
      askFullscreen(tg)
      // iOS: повторить по первому жесту
      const once = () => askFullscreen(tg)
      window.addEventListener("touchstart", once, { once: true, passive: true })
      window.addEventListener("click", once, { once: true })

      // ——— сессия Supabase по initData (если нет)
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const res = await fetch("/api/auth/telegram/miniapp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: tg.initData || "", initDataUnsafe: tg.initDataUnsafe || {} }),
          credentials: "include",
        })
        if (res.ok) {
          const r = await supabase.auth.getUser()
          user = r.data.user ?? null
        }
      }
      if (!user) {
        setReady(true)
        return
      }

      // ——— жёсткая проверка профиля: в TMA незаполненного — на мини-регистрацию
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("gender,height,weight,top_size,bottom_size,shoe_size")
        .eq("user_id", user.id)
        .single()

      const required = ["gender","height","weight","top_size","bottom_size","shoe_size"]
      const missing = !profile || error
        ? required
        : required.filter(k => {
            const v = (profile as any)[k]
            return v === null || v === undefined || v === ""
          })

      if (missing.length > 0) {
        router.replace("/auth/mini-registration")
        return
      }

      setReady(true)
    }
    boot()
  }, [router, supabase])

  // ——— отладочный виджет
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

  if (!ready) return <Debug />
  return (
    <>
      {children}
      <Debug />
    </>
  )
}
