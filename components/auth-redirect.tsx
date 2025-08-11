"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
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
  const authCheckInProgress = useRef(false)

  useEffect(() => {
    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (process.env.NODE_ENV === "development") {
        console.log("Auth state changed:", event, !!session)
      }

      if (event === "SIGNED_IN" && session) {
        setAuthenticated(true)
        setLoading(false)
      } else if (event === "SIGNED_OUT" || !session) {
        setAuthenticated(false)
        setLoading(false)

        if (requireAuth) {
          router.push(redirectTo)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth, router, requireAuth, redirectTo])

  const checkAuth = async () => {
    if (authCheckInProgress.current) {
      return
    }

    authCheckInProgress.current = true

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (process.env.NODE_ENV === "development") {
        console.log("Auth check result:", { user: !!user, error })
      }

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
      authCheckInProgress.current = false
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
