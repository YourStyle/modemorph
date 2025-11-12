"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { tmaHandshake } from "@/lib/tma/handshake"
import { sessionAuth } from "@/lib/tma/session-auth"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"
import { NetworkError as NetworkErrorComponent } from "@/components/network-error"

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

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const onMiniReg = (pathname || "").startsWith("/auth/mini-registration")

  const [ready, setReady] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const fsTried = useRef(false)
  const askFullscreen = (tg: any) => {
    if (fsTried.current) return
    fsTried.current = true
    // Только expand, без fullscreen для всех платформ
    try {
      tg?.expand?.()
    } catch {}
  }

  useEffect(() => {
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

        // 1) Хэндшейк с повторными попытками
        let user = null
        let handshakeAttempts = 0
        const maxHandshakeAttempts = 3

        while (!user && handshakeAttempts < maxHandshakeAttempts) {
          handshakeAttempts++
          console.log(`[MiniAppRegistrationGate] Handshake attempt ${handshakeAttempts}/${maxHandshakeAttempts}`)

          try {
            user = await tmaHandshake()
            if (user) break

            // Если не получилось, ждем перед повторной попыткой
            if (handshakeAttempts < maxHandshakeAttempts) {
              console.log(`[MiniAppRegistrationGate] Handshake failed, retrying in 1 second...`)
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          } catch (error) {
            console.error(`[MiniAppRegistrationGate] Handshake attempt ${handshakeAttempts} error:`, error)
            if (handshakeAttempts < maxHandshakeAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }
        }

        // 2) Если нет пользователя после всех попыток — пускаем на форму ТОЛЬКО если мы не на ней
        if (!user) {
          console.log("[MiniAppRegistrationGate] All handshake attempts failed, redirecting to registration")
          if (!onMiniReg) {
            redirecting = true
            router.replace("/auth/mini-registration?from=tma")
          }
          return
        }

        // 3) Проверяем профиль с session-based авторизацией
        console.log("[MiniAppRegistrationGate] User authenticated, checking profile...")

        try {
          const accessToken = sessionAuth.getAccessToken()
          if (!accessToken) {
            console.log("[MiniAppRegistrationGate] No access token, redirecting to registration")
            if (!onMiniReg) {
              redirecting = true
              router.replace("/auth/mini-registration?from=tma")
            }
            return
          }

          console.log("[MiniAppRegistrationGate] Fetching profile with access token")

          // Используем универсальный API клиент или session-based endpoint
          const profileResponse = await fetchWithRetry(
            "/api/me/profile",
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`
              },
              cache: "no-store",
            },
            {
              timeout: 15000,  // Увеличено до 15 секунд
              retries: 3,      // Увеличено до 3 попыток
              retryDelay: 1000,
              backoff: true    // Экспоненциальная задержка
            }
          )

          console.log("[MiniAppRegistrationGate] Profile response status:", profileResponse.status)

          if (!profileResponse.ok) {
            if (profileResponse.status === 401) {
              // Токен недействителен, очищаем сессию и редиректим
              console.log("[MiniAppRegistrationGate] Invalid token, clearing session")
              sessionAuth.clearSession()
              if (!onMiniReg) {
                redirecting = true
                router.replace("/auth/mini-registration?from=tma")
                return
              }
            } else {
              // Другая ошибка - логируем и пропускаем пользователя (fail-open)
              console.log("[MiniAppRegistrationGate] Profile API error, allowing access (fail-open)")
            }
          } else {
            const profileData = await profileResponse.json()
            console.log("[MiniAppRegistrationGate] Profile data received:", {
              hasProfile: !!profileData.profile,
              profile: profileData.profile
            })

            // Если профиль не найден (новый пользователь) - редиректим на онбординг
            if (!profileData.profile) {
              console.log("[MiniAppRegistrationGate] No profile found, redirecting new user to registration")
              if (!onMiniReg) {
                redirecting = true
                router.replace("/auth/mini-registration?from=tma")
                return
              }
            } else {
              console.log("[MiniAppRegistrationGate] Profile found, allowing access to app")
            }
          }

          console.log("[MiniAppRegistrationGate] Profile check successful, allowing access")
        } catch (error) {
          console.error("[MiniAppRegistrationGate] Profile check failed:", error)

          // Обрабатываем сетевые ошибки
          if (error instanceof NetworkError) {
            if (error.isOffline) {
              setNetworkError("Нет подключения к интернету")
            } else {
              setNetworkError("Проблема с сетью")
            }
            return
          } else if (error instanceof TimeoutError) {
            setNetworkError("Превышено время ожидания")
            return
          }

          // При других ошибках - пропускаем пользователя (fail-open подход)
          console.log("[MiniAppRegistrationGate] Non-network error, allowing access (fail-open)")
        }


        // 5) Всё ок — пропускаем детей
        return
      } finally {
        // КРИТИЧНО: никогда не держать экран серым
        if (!cancelled && !redirecting) setReady(true)
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [router, pathname])


  // Показываем ошибку сети
  if (networkError) {
    return (
      <NetworkErrorComponent
        message={networkError}
        onRetry={() => {
          setNetworkError(null)
          setReady(false)
          // Перезагружаем страницу для повторной попытки
          window.location.reload()
        }}
      />
    )
  }

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
