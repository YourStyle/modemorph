"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { sessionAuth } from "@/lib/tma/session-auth"
import { AnimatedLanding } from "@/components/animated-landing"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"
import { NetworkError as NetworkErrorComponent } from "@/components/network-error"
import { useAuth } from "@/contexts/auth-context"

// Хелпер для определения контекста (TMA vs обычный веб)
function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false
  const tg = window.Telegram?.WebApp
  return !!(tg?.initData && tg.initData.trim().length > 0)
}

export default function HomePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [showLanding, setShowLanding] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  // Для обычных пользователей (cookie-based auth)
  const { user: cookieUser, loading: authLoading } = useAuth()

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const inTMA = isTelegramMiniApp()
        console.log("[HomePage] Context:", inTMA ? "Telegram Mini App" : "Regular Web")

        // === TELEGRAM MINI APP FLOW ===
        if (inTMA) {
          // Проверяем TMA сессию через sessionAuth
          if (sessionAuth.hasValidSession()) {
            const userId = sessionAuth.getUserId()
            if (userId) {
              console.log("[HomePage] TMA user authenticated, checking profile...")

              const accessToken = sessionAuth.getAccessToken()
              if (accessToken) {
                // Выполняем запросы параллельно
                const [profileResponse, userInfoResponse] = await Promise.all([
                  fetchWithRetry(
                    "/api/me/profile",
                    {
                      headers: { "Authorization": `Bearer ${accessToken}` }
                    },
                    { timeout: 8000, retries: 2 }
                  ),
                  fetchWithRetry(
                    "/api/me",
                    {
                      headers: { "Authorization": `Bearer ${accessToken}` }
                    },
                    { timeout: 8000, retries: 2 }
                  )
                ])

                if (profileResponse.ok && userInfoResponse.ok) {
                  const [profileData, userData] = await Promise.all([
                    profileResponse.json(),
                    userInfoResponse.json()
                  ])

                  if (profileData.profile) {
                    if (userData.profile?.is_admin) {
                      console.log("[HomePage] TMA admin user, redirecting to /admin")
                      router.replace("/admin")
                      return
                    } else {
                      console.log("[HomePage] TMA regular user, redirecting to /app")
                      router.replace("/app")
                      return
                    }
                  }
                }
              }
            }
          }

          // Если в TMA но нет сессии - показываем лендинг
          console.log("[HomePage] TMA: No valid session, showing landing")
          setShowLanding(true)
          return
        }

        // === REGULAR WEB FLOW ===
        // Ждем пока AuthProvider загрузит пользователя
        if (authLoading) {
          console.log("[HomePage] Web: Waiting for auth to load...")
          return
        }

        // Если есть пользователь из cookie-based auth
        if (cookieUser) {
          console.log("[HomePage] Web user authenticated, checking profile...")

          // Выполняем запросы параллельно
          const [profileResponse, userInfoResponse] = await Promise.all([
            fetchWithRetry(
              "/api/me/profile",
              { credentials: "include" },
              { timeout: 8000, retries: 2 }
            ),
            fetchWithRetry(
              "/api/me",
              { credentials: "include" },
              { timeout: 8000, retries: 2 }
            )
          ])

          if (profileResponse.ok && userInfoResponse.ok) {
            const [profileData, userData] = await Promise.all([
              profileResponse.json(),
              userInfoResponse.json()
            ])

            if (profileData.profile || userData.profile) {
              if (userData.profile?.is_admin) {
                console.log("[HomePage] Web admin user, redirecting to /admin")
                router.replace("/admin")
                return
              } else {
                console.log("[HomePage] Web regular user, redirecting to /app")
                router.replace("/app")
                return
              }
            }
          }
        }

        // Если нет авторизации - показываем лендинг
        console.log("[HomePage] Web: No authenticated user, showing landing")
        setShowLanding(true)
      } catch (error) {
        console.error("[HomePage] Error checking auth:", error)

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

        // При других ошибках показываем лендинг
        setShowLanding(true)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuthAndRedirect()
  }, [router, authLoading, cookieUser])

  // Показываем ошибку сети
  if (networkError) {
    return (
      <NetworkErrorComponent
        message={networkError}
        onRetry={() => {
          setNetworkError(null)
          setIsLoading(true)
          window.location.reload()
        }}
      />
    )
  }

  if (isLoading) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    )
  }

  if (showLanding) {
    return <AnimatedLanding />
  }

  // Показываем загрузку во время редиректа
  return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
  )
}