"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { sessionAuth } from "@/lib/tma/session-auth"
import { AnimatedLanding } from "@/components/animated-landing"
import { API } from "@/lib/api"

export default function HomePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [showLanding, setShowLanding] = useState(false)

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        // Проверяем сессию
        if (sessionAuth.hasValidSession()) {
          const userId = sessionAuth.getUserId()
          if (userId) {
            console.log("[HomePage] User authenticated, checking profile...")

            // Проверяем профиль пользователя
            const profileResponse = await API.user.getProfile()

            if (profileResponse.ok && profileResponse.data) {
              // Если профиль есть, проверяем роль
              if (profileResponse.data.profile) {
                // Получаем информацию о роли пользователя
                const userResponse = await API.user.getMe()

                if (userResponse.ok && userResponse.data) {
                  if (userResponse.data.profile?.is_admin) {
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

        // Если нет сессии или не удалось получить данные - показываем лендинг
        console.log("[HomePage] No valid session, showing landing")
        setShowLanding(true)
      } catch (error) {
        console.error("[HomePage] Error checking auth:", error)
        setShowLanding(true)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuthAndRedirect()
  }, [router])

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
