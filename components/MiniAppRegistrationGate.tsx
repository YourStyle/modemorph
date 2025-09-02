// components/MiniAppRegistrationGate.tsx
// Добавляет: (1) детект Telegram Mini App, (2) отложенный редирект на мини-регистрацию,
// (3) фиксированный debug-виджет со статусами (вкл: NEXT_PUBLIC_TMA_DEBUG=1 или ?tma_debug=1),
// (4) referral больше НЕ обязателен.

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        platform?: string
        colorScheme?: string
        themeParams?: Record<string, unknown>
        version?: string
        initData?: string
        initDataUnsafe?: Record<string, unknown>
        isExpanded?: boolean
        ready: () => void
        expand: () => void
        enableClosingConfirmation?: () => void
        setHeaderColor?: (colorKeyOrHex: string) => void
        setBackgroundColor?: (hex: string) => void
        viewportStableHeight?: number
      }
    }
  }
}

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [ready, setReady] = useState(false)

  // --- Debug state (виджет) ---
  const [debugVisible, setDebugVisible] = useState(false)
  const [debug, setDebug] = useState<{
    isMiniApp: boolean
    platform?: string
    colorScheme?: string
    version?: string
    initDataPresent: boolean
    userId?: string | null
    profileOk?: boolean
    profileMissing?: string[]
  }>({ isMiniApp: false, initDataPresent: false })

  useEffect(() => {
    // Включение debug-виджета: env или query (?tma_debug=1)
    const fromEnv = (process.env.NEXT_PUBLIC_TMA_DEBUG || "").toString() === "1"
    const fromQuery = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tma_debug") === "1"
    setDebugVisible(fromEnv || fromQuery)
  }, [])

  useEffect(() => {
    async function check() {
      const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
      const isMiniApp = !!tg

      // Базовая инициализация Mini App (безопасна при повторных вызовах)
      if (isMiniApp) {
        try {
          tg!.ready()
          tg!.expand?.()
          tg!.setHeaderColor?.(tg!.colorScheme === "dark" ? "secondary_bg_color" : "#ffffff")
        } catch {}
      }

      // Для debug-виджета пока нет данных о пользователе/профиле
      setDebug((prev) => ({
        ...prev,
        isMiniApp,
        platform: tg?.platform,
        colorScheme: tg?.colorScheme,
        version: tg?.version,
        initDataPresent: !!tg?.initData || !!tg?.initDataUnsafe,
      }))

      // Если открыто НЕ в Mini App — просто рендерим приложение
      if (!isMiniApp) {
        setReady(true)
        return
      }

      // Получаем текущую сессию пользователя
      const { data: { user } } = await supabase.auth.getUser()
      setDebug((prev) => ({ ...prev, userId: user?.id ?? null }))

      // Если не авторизован — пропускаем (пусть логика входа выполнится где-то ещё)
      if (!user) {
        setReady(true)
        return
      }

      // Считываем профиль пользователя
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select(
          // referral не обязателен
          "gender, height, weight, top_size, bottom_size, shoe_size"
        )
        .eq("user_id", user.id)
        .single()

      // Определяем «обязательные» поля профиля для мини-регистрации
      const required: Array<keyof typeof profile> = [
        "gender",
        "height",
        "weight",
        "top_size",
        "bottom_size",
        "shoe_size",
      ] as any

      const missing: string[] = []
      if (!error && profile) {
        for (const k of required) {
          const v = (profile as any)?.[k]
          if (v === null || v === undefined || v === "") missing.push(k as string)
        }
      } else {
        // Если селект вернул error/empty — считаем, что все обязательные поля отсутствуют
        missing.push(...(required as string[]))
      }

      setDebug((prev) => ({
        ...prev,
        profileOk: missing.length === 0,
        profileMissing: missing,
      }))

      // Редирект в мини-регистрацию, только если профиль неполный
      if (missing.length > 0) {
        router.replace("/auth/mini-registration")
        return
      }

      setReady(true)
    }

    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Фиксированный debug-виджет (показывается поверх всего при включённом флаге)
  const DebugWidget = () =>
    !debugVisible ? null : (
      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 9999,
          maxWidth: 320,
          fontSize: 12,
          lineHeight: 1.35,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          borderRadius: 12,
          padding: "10px 12px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
          backdropFilter: "blur(2px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <strong>TMA Debug</strong>
          <button
            onClick={() => setDebugVisible(false)}
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
          <div>isMiniApp: <b>{String(debug.isMiniApp)}</b></div>
          <div>platform: <b>{debug.platform || "-"}</b></div>
          <div>colorScheme: <b>{debug.colorScheme || "-"}</b></div>
          <div>version: <b>{debug.version || "-"}</b></div>
          <div>initData: <b>{debug.initDataPresent ? "present" : "absent"}</b></div>
          <div>userId: <b>{debug.userId || "-"}</b></div>
          <div>profileOk: <b>{debug.profileOk === undefined ? "-" : String(debug.profileOk)}</b></div>
          {!!debug.profileMissing?.length && (
            <div>missing: <b>{debug.profileMissing.join(", ")}</b></div>
          )}
        </div>
      </div>
    )

  if (!ready) {
    // На время проверки можно (по желанию) вернуть спиннер
    return (
      <>
        <DebugWidget />
      </>
    )
  }

  return (
    <>
      {children}
      <DebugWidget />
    </>
  )
}
