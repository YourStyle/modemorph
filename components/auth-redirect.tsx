"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

interface AuthRedirectProps {
  userId: string
}

export function AuthRedirect({ userId }: AuthRedirectProps) {
  const router = useRouter()

  useEffect(() => {
    async function checkUserRole() {
      try {
        // Сначала пытаемся получить профиль
        let response = await fetch("/api/user-profile")

        if (response.status === 404) {
          // Если профиля нет, создаем его
          response = await fetch("/api/user-profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          })
        }

        if (!response.ok) {
          console.error("Error with user profile:", await response.text())
          router.push("/app") // По умолчанию в пользовательскую зону
          return
        }

        const profile = await response.json()

        // Перенаправляем в зависимости от роли
        if (profile.is_admin) {
          router.push("/admin")
        } else {
          router.push("/app")
        }
      } catch (error) {
        console.error("Error checking user role:", error)
        router.push("/app") // По умолчанию в пользовательскую зону
      }
    }

    checkUserRole()
  }, [userId, router])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Перенаправление...</p>
      </div>
    </div>
  )
}
