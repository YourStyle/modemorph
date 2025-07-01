"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthRedirectProps {
  children: React.ReactNode
  adminRedirect?: string
  userRedirect?: string
}

export function AuthRedirect({ children, adminRedirect, userRedirect }: AuthRedirectProps) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user: authUser },
          error,
        } = await supabase.auth.getUser()

        if (error || !authUser) {
          router.push("/auth/login")
          return
        }

        setUser(authUser)

        // Получаем профиль пользователя
        try {
          const response = await fetch("/api/user-profile")

          if (response.ok) {
            const contentType = response.headers.get("content-type")
            if (contentType && contentType.includes("application/json")) {
              const profile = await response.json()

              // Перенаправляем админов
              if (profile.is_admin && adminRedirect) {
                router.push(adminRedirect)
                return
              }

              // Перенаправляем пользователей
              if (!profile.is_admin && userRedirect) {
                router.push(userRedirect)
                return
              }
            }
          } else if (response.status === 404) {
            // Профиль не найден, создаем его
            const createResponse = await fetch("/api/user-profile", {
              method: "POST",
            })

            if (createResponse.ok) {
              const newProfile = await createResponse.json()

              // Перенаправляем админов
              if (newProfile.is_admin && adminRedirect) {
                router.push(adminRedirect)
                return
              }

              // Перенаправляем пользователей
              if (!newProfile.is_admin && userRedirect) {
                router.push(userRedirect)
                return
              }
            }
          }
        } catch (profileError) {
          console.error("Error handling profile:", profileError)
          // Продолжаем без перенаправления при ошибке профиля
        }
      } catch (authError) {
        console.error("Auth error:", authError)
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, adminRedirect, userRedirect, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
