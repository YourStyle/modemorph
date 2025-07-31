"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface AuthRedirectProps {
  children: React.ReactNode
  requireAuth?: boolean
  redirectTo?: string
}

export function AuthRedirect({ children, requireAuth = true, redirectTo = "/auth/login" }: AuthRedirectProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()

    // Подписываемся на изменения авторизации
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user)
        setLoading(false)
      } else if (event === "SIGNED_OUT") {
        setUser(null)
        setLoading(false)
        if (requireAuth) {
          router.push(redirectTo)
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [requireAuth, redirectTo, router, supabase.auth])

  const checkAuth = async () => {
    try {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser()

      if (error) {
        console.error("Auth error:", error)
        setUser(null)
      } else {
        setUser(currentUser)
      }

      // Если требуется авторизация, но пользователя нет
      if (requireAuth && !currentUser) {
        router.push(redirectTo)
        return
      }

      // Если не требуется авторизация, но пользователь есть
      if (!requireAuth && currentUser) {
        router.push("/app")
        return
      }
    } catch (error) {
      console.error("Error checking auth:", error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  // Показываем загрузку
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // Если требуется авторизация, но пользователя нет
  if (requireAuth && !user) {
    return null // Редирект уже произошел
  }

  // Если не требуется авторизация, но пользователь есть
  if (!requireAuth && user) {
    return null // Редирект уже произошел
  }

  return <>{children}</>
}
