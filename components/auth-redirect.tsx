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

        if (userError || !user) {
          router.push("/auth/login")
          return
        }

        // Сначала пытаемся получить существующий профиль
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

          if (profile.is_admin) {
            router.push(adminRedirect)
          } else {
            router.push(userRedirect)
          }
        } else {
          // Если не удалось создать профиль, перенаправляем как обычного пользователя
          router.push(userRedirect)
        }
      } catch (err) {
        console.error("Error checking user role:", err)
        setError("Ошибка проверки роли пользователя")
        // В случае ошибки перенаправляем как обычного пользователя
        router.push(userRedirect)
      } finally {
        setLoading(false)
      }
    }

    checkUserRole()
  }, [router, adminRedirect, userRedirect])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Проверка роли пользователя...</p>
        </div>
      </div>
    )
  }

  return null
}
