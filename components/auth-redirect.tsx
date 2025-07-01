"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthRedirectProps {
  adminRedirect?: string
  userRedirect?: string
}

export function AuthRedirect({ adminRedirect = "/admin", userRedirect = "/app" }: AuthRedirectProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkUserRole = async () => {
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
            avatar_url: user.user_metadata?.avatar_url || "",
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
          console.error("Failed to create profile")
          // Fallback - перенаправляем в пользовательскую зону
          router.push(userRedirect)
        }
      } catch (error) {
        console.error("Error checking user role:", error)
        // Fallback - перенаправляем в пользовательскую зону
        router.push(userRedirect)
      } finally {
        setLoading(false)
      }
    }

    checkUserRole()
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
