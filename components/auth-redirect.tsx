"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthRedirectProps {
  adminRedirect?: string
  userRedirect?: string
}

export function AuthRedirect({ adminRedirect = "/admin", userRedirect = "/app" }: AuthRedirectProps) {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      try {
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
        let profile = null

        if (profileResponse.ok) {
          const data = await profileResponse.json()
          profile = data.profile
        }

        // Если профиля нет, создаем его
        if (!profile) {
          const createResponse = await fetch("/api/user-profile", {
            method: "POST",
          })

          if (createResponse.ok) {
            const data = await createResponse.json()
            profile = data.profile
          }
        }

        // Перенаправляем в зависимости от роли
        if (profile?.is_admin) {
          router.push(adminRedirect)
        } else {
          router.push(userRedirect)
        }
      } catch (error) {
        console.error("Error in auth redirect:", error)
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkUserAndRedirect()
  }, [router, adminRedirect, userRedirect, supabase.auth])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return null
}
