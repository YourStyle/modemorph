// components/MiniAppRegistrationGate.tsx
// Детект Telegram Mini App ТОЛЬКО когда есть реальное initData из Telegram,
// плюс фиксированный debug-виджет. referral не обязателен.

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
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
        ready: () => void
        expand?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
      }
    }
  }
}

function isRunningInTMA(): { ok: boolean; why: string; details: Record<string, any> } {
  const w = typeof window !== "undefined" ? window : ({} as any)
  const tg = w.Telegram?.WebApp
  const ua = (w.navigator?.userAgent || "").toLowerCase()

  const exists = !!tg
  const initData = (tg?.initData || "").trim()
  const hasInitData = initData.length > 0
  const hasSignedUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
  const platformOk = !!tg?.platform && tg!.platform !== "unknown"

  // ТОЛЬКО реальное initData + user/query_id считаем Mini App
  const ok = exists && hasInitData && hasSignedUser && platformOk

  return {
    ok,
    why: ok
      ? "tg+initData+user+platform"
      : `exists=${exists} initData=${hasInitData} userOrQuery=${hasSignedUser} platformOk=${platformOk}`,
    details: {
      exists,
      hasInitData,
      hasSignedUser,
      platform: tg?.platform ?? "n/a",
      version: tg?.version ?? "n/a",
      ua,
    },
  }
}

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [ready, setReady] = useState(false)

  const [debugOn, setDebugOn] = useState(false)
  const [dbg, setDbg] = useState<any>({})

  useEffect(() => {
    const env = (process.env.NEXT_PUBLIC_TMA_DEBUG || "") === "1"
    const q = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tma_debug") === "1"
    setDebugOn(env || q)
  }, [])

  useEffect(() => {
    async function run() {
      const d = isRunningInTMA()
      setDbg((p: any) => ({ ...p, detect: d }))

      if (!d.ok) {
        setReady(true)
        return
      }

      try {
        window.Telegram?.WebApp?.ready()
        window.Telegram?.WebApp?.expand?.()
        window.Telegram?.WebApp?.setHeaderColor?.(
          window.Telegram?.WebApp?.colorScheme === "dark" ? "secondary_bg_color" : "#ffffff"
        )
      } catch {}

      const { data: { user } } = await supabase.auth.getUser()
      setDbg((p: any) => ({ ...p, userId: user?.id ?? null }))

      if (!user) {
        setReady(true)
        return
      }

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
      setDbg((p: any) => ({ ...p, profileMissing: missing }))

      if (missing.length > 0) {
        router.replace("/auth/mini-registration")
        return
      }

      setReady(true)
    }
    run()
  }, [router, supabase])

  const Debug = () =>
    !debugOn ? null : (
      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 9999,
          maxWidth: 340,
          fontSize: 12,
          lineHeight: 1.35,
          background: "rgba(0,0,0,0.78)",
          color: "#fff",
          borderRadius: 12,
          padding: "10px 12px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <strong>TMA Debug</strong>
          <button
            onClick={() => setDebugOn(false)}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              borderRadius: 8,
              fontSize: 11,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            hide
          </button>
        </div>

        <div style={{ display: "grid", rowGap: 4 }}>
          <div>ok: <b>{String(dbg.detect?.ok)}</b></div>
          <div>why: <b>{dbg.detect?.why || "-"}</b></div>
          <div>platform: <b>{dbg.detect?.details?.platform || "-"}</b></div>
          <div>version: <b>{dbg.detect?.details?.version || "-"}</b></div>
          <div>hasInitData: <b>{String(dbg.detect?.details?.hasInitData)}</b></div>
          <div>hasSignedUser: <b>{String(dbg.detect?.details?.hasSignedUser)}</b></div>
          <div>userId: <b>{dbg.userId ?? "-"}</b></div>
          {!!dbg.profileMissing?.length && (
            <div>profileMissing: <b>{dbg.profileMissing.join(", ")}</b></div>
          )}
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
