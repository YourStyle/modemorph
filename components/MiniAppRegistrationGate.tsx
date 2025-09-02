// components/MiniAppRegistrationGate.tsx
// 1) Запрос полноэкранного режима через WebApp.requestFullscreen() сразу после ready().
//    Делаем повторные попытки и привязку к пользовательскому жесту (iOS).
// 2) Если Mini App и пользователь ещё не зарегистрирован — редиректим на /auth/mini-registration.
// 3) Фиксированный debug-виджет: показывает isMiniApp / fullscreenRequested / fullscreenGranted.

"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

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
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        onEvent?: (event: string, cb: (...args: any[]) => void) => void
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

interface Props { children: ReactNode }

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [ready, setReady] = useState(false)

  // --- debug state ---
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

  // --- fullscreen helper ---
  const triedFS = useRef(false)
  const requestFullscreen = (tg: NonNullable<typeof window.Telegram>["WebApp"]) => {
    if (triedFS.current) return
    triedFS.current = true
    try { tg?.requestFullscreen?.() } catch {}
    try { tg?.expand?.() } catch {}
    setStatus((s) => ({ ...s, fullscreenRequested: true }))
  }

  useEffect(() => {
    async function boot() {
      const { inTMA, tg } = detectTMA()
      setStatus((s) => ({
        ...s,
        isMiniApp: inTMA,
        platform: tg?.platform || "-",
        version: tg?.version || "-",
      }))

      if (!inTMA || !tg) {
        setReady(true)
        return
      }

      // Инициализация Mini App
      try {
        tg.ready()
        tg.setHeaderColor?.(tg.colorScheme === "dark" ? "secondary_bg_color" : "#ffffff")
        tg.setBackgroundColor?.(tg.colorScheme === "dark" ? "#0e0e10" : "#ffffff")
      } catch {}

      // Запрос fullscreen сразу…
      requestFullscreen(tg)
      // …и повторно, когда вьюпорт стабилизируется
      tg.onEvent?.("viewportChanged", () => {
        const granted = !!tg.isExpanded || (tg.viewportStableHeight || 0) >= (window.innerHeight - 1)
        setStatus((s) => ({ ...s, fullscreenGranted: granted }))
        if (!granted) requestFullscreen(tg)
      })
      // …и по пользовательскому жесту (важно для iOS)
      const gestureOnce = () => requestFullscreen(tg)
      window.addEventListener("touchstart", gestureOnce, { once: true, passive: true })
      window.addEventListener("click", gestureOnce, { once: true })

      // Обмен initData → Supabase session (если сессии ещё нет)
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const initData = tg.initData || ""
        const initDataUnsafe = tg.initDataUnsafe || {}
        const res = await fetch("/api/auth/telegram/miniapp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData, initDataUnsafe }),
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

      // Проверка профиля: если незаполнен — редирект на регистрацию
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("gender,height,weight,top_size,bottom_size,shoe_size")
        .eq("user_id", user.id)
        .single()

      const missing: string[] = []
      if (error || !profile) {
        missing.push("gender","height","weight","top_size","bottom_size","shoe_size")
      } else {
        for (const k of ["gender","height","weight","top_size","bottom_size","shoe_size"]) {
          const v = (profile as any)[k]
          if (v === null || v === undefined || v === "") missing.push(k)
        }
      }

      if (missing.length > 0) {
        router.replace("/auth/mini-registration")
        return
      }

      setReady(true)
    }
    boot()
  }, [router, supabase])

  // --- fixed debug widget ---
  const Debug = () =>
    !dbgOn ? null : (
      <div style={{
        position: "fixed", right: 12, bottom: 12, zIndex: 9999,
        background: "rgba(0,0,0,0.78)", color: "#fff", borderRadius: 12,
        padding: "10px 12px", maxWidth: 340, fontSize: 12, lineHeight: 1.35,
      }}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <b>TMA Debug</b>
          <button onClick={()=>setDbgOn(false)} style={{border:"1px solid rgba(255,255,255,.25)",background:"transparent",color:"#fff",borderRadius:8,fontSize:11,padding:"2px 6px"}}>hide</button>
        </div>
        <div style={{display:"grid",rowGap:4}}>
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
