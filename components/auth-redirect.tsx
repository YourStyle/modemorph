"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"

interface AuthRedirectProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
}

export function AuthRedirect({ children, requireAuth = true, redirectTo = "/auth/login" }: AuthRedirectProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    console.log("[v0] AuthRedirect check:", { user: !!user, loading, requireAuth })

    const checkAuthCookies = () => {
      if (typeof document === "undefined") return true

      const cookies = document.cookie
      const hasSupabaseAuthToken = cookies.includes("sb-") && cookies.includes("-auth-token")

      if (!cookies || !hasSupabaseAuthToken) {
        if (requireAuth) {
          console.log("[v0] No auth cookies, redirecting to home")
          router.push("/")
          return false
        }
      }
      return true
    }

    if (!loading) {
      if (!checkAuthCookies()) {
        return
      }

      const isAuthenticated = !!user

      if (requireAuth && !isAuthenticated) {
        console.log("[v0] Auth required but user not authenticated, redirecting to:", redirectTo)
        router.push(redirectTo)
      } else if (!requireAuth && isAuthenticated) {
        console.log("[v0] User authenticated but auth not required, redirecting to app")
        router.push("/app")
      }
    }
  }, [user, loading, router, requireAuth, redirectTo])

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

  if (requireAuth && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="text-gray-600">Перенаправление...</p>
        </div>
      </div>
    )
  }

  if (!requireAuth && user) {
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
