"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

interface AuthRedirectProps {
  adminRedirect?: string
  userRedirect?: string
}

export function AuthRedirect({ adminRedirect = "/admin", userRedirect = "/app" }: AuthRedirectProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkUserRole() {
      try {
        const supabase = createClient()

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) {
          console.error("Auth error:", userError)
          router.push("/auth/login")
          return
        }

        if (!user) {
          router.push("/auth/login")
          return
        }

        // Пытаемся получить существующий профиль
        try {
          const profileResponse = await fetch("/api/user-profile")

          if (profileResponse.ok) {
            const { profile } = await profileResponse.json()

            if (profile) {
              // Профиль существует, перенаправляем по роли
              if (profile.is_admin) {
                router.push(adminRedirect)
              } else {
                router.push(userRedirect)
              }
              return
            }
          }

          // Профиля нет, создаем новый
          const createResponse = await fetch("/api/user-profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              full_name: user.user_metadata?.full_name || "",
            }),
          })

          if (createResponse.ok) {
            const { profile } = await createResponse.json()

            if (profile?.is_admin) {
              router.push(adminRedirect)
            } else {
              router.push(userRedirect)
            }
          } else {
            // Если не удалось создать профиль, перенаправляем как обычного пользователя
            console.warn("Failed to create profile, redirecting as regular user")
            router.push(userRedirect)
          }
        } catch (profileError) {
          console.error("Profile error:", profileError)
          // В случае ошибки с профилем, перенаправляем как обычного пользователя
          router.push(userRedirect)
        }
      } catch (err) {
        console.error("Error checking user role:", err)
        setError("Ошибка проверки роли пользователя")
        // В случае критической ошибки перенаправляем на страницу входа
        setTimeout(() => {
          router.push("/auth/login")
        }, 3000)
      } finally {
        setLoading(false)
      }
    }

    checkUserRole()
  }, [router, adminRedirect, userRedirect])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-6 bg-white rounded-lg shadow-sm border max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500 mb-4">Перенаправление на страницу входа...</p>
          <button
            onClick={() => router.push("/auth/login")}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Перейти к входу
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Проверка роли пользователя...</p>
        </div>
      </div>
    )
  }

  return null
}
