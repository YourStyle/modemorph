"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthRedirectProps {
  children: React.ReactNode
  redirectTo?: string
}

export function AuthRedirect({ children, redirectTo = "/auth/login" }: AuthRedirectProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error) {
          console.error("Auth check error:", error)
          setIsAuthenticated(false)
          router.push(redirectTo)
          return
        }

        if (user) {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
          router.push(redirectTo)
        }
      } catch (error) {
        console.error("Auth check failed:", error)
        setIsAuthenticated(false)
        router.push(redirectTo)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()

    // Подписываемся на изменения состояния аутентификации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setIsAuthenticated(false)
        router.push(redirectTo)
      } else if (event === "SIGNED_IN" && session) {
        setIsAuthenticated(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, router, redirectTo])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Перенаправление...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
