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
      console.log("Auth state changed:", event, !!session)

      if (event === "SIGNED_IN" && session) {
        setAuthenticated(true)
        setLoading(false)
      } else if (event === "SIGNED_OUT" || !session) {
        setAuthenticated(false)
        setLoading(false)

        if (requireAuth) {
          console.log("User signed out, redirecting to:", redirectTo)
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

      console.log("Auth check result:", { user: !!user, error })

      if (error) {
        console.error("Auth error:", error)
        setAuthenticated(false)
        if (requireAuth) {
          console.log("Auth error, redirecting to:", redirectTo)
          router.push(redirectTo)
        }
        return
      }

      const isAuthenticated = !!user
      setAuthenticated(isAuthenticated)

      if (requireAuth && !isAuthenticated) {
        console.log("User not authenticated, redirecting to:", redirectTo)
        router.push(redirectTo)
      } else if (!requireAuth && isAuthenticated) {
        // Если пользователь уже авторизован и находится на странице входа/регистрации
        console.log("User already authenticated, redirecting to /app")
        router.push("/app")
      }
    } catch (error) {
      console.error("Error checking auth:", error)
      setAuthenticated(false)
      if (requireAuth) {
        console.log("Auth check error, redirecting to:", redirectTo)
        router.push(redirectTo)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Проверка авторизации...</p>
        </div>
      </div>
    )
  }

  if (requireAuth && !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Перенаправление...</p>
        </div>
      </div>
    )
  }

  if (!requireAuth && authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Перенаправление...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
