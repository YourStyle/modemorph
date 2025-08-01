"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthRedirectProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
}

export function AuthRedirect({ children, requireAuth = true, redirectTo = "/auth/login" }: AuthRedirectProps) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()

    // Подписываемся на изменения состояния аутентификации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        setAuthenticated(true)
      } else if (event === "SIGNED_OUT") {
        setAuthenticated(false)
        if (requireAuth) {
          router.push(redirectTo)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth, router, requireAuth, redirectTo])

  const checkAuth = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error) {
        console.error("Auth error:", error)
        setAuthenticated(false)
        if (requireAuth) {
          router.push(redirectTo)
        }
        return
      }

      const isAuthenticated = !!user
      setAuthenticated(isAuthenticated)

      if (requireAuth && !isAuthenticated) {
        router.push(redirectTo)
      } else if (!requireAuth && isAuthenticated) {
        // Если пользователь уже авторизован и находится на странице входа/регистрации
        router.push("/app")
      }
    } catch (error) {
      console.error("Error checking auth:", error)
      setAuthenticated(false)
      if (requireAuth) {
        router.push(redirectTo)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (requireAuth && !authenticated) {
    return null // Компонент перенаправит пользователя
  }

  if (!requireAuth && authenticated) {
    return null // Компонент перенаправит пользователя
  }

  return <>{children}</>
}
