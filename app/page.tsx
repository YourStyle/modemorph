"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { sessionAuth } from "@/lib/tma/session-auth"
import { AnimatedLanding } from "@/components/animated-landing"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"
import { NetworkError as NetworkErrorComponent } from "@/components/network-error"

export default function HomePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [showLanding, setShowLanding] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        // Проверяем сессию через sessionAuth (работает и для TMA, и для email login)
        if (sessionAuth.hasValidSession()) {
          const userId = sessionAuth.getUserId()
          if (userId) {
            console.log("[HomePage] User authenticated via sessionAuth, checking profile...")

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
                    console.log("[HomePage] Admin user, redirecting to /admin")
                    router.replace("/admin")
                    return
                  } else {
                    console.log("[HomePage] Regular user, redirecting to /app")
                    router.replace("/app")
                    return
                  }
                }
              }
            }
          }
        }

        // Если нет сессии - показываем лендинг
        console.log("[HomePage] No valid session, showing landing")
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
  }, [router])

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