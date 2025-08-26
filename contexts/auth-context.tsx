"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  trackUnauthorizedError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorizedCount, setUnauthorizedCount] = useState(0)
  const supabase = createClient()
  const router = useRouter()

  // Очищаем некорректные токены при ошибке обновления
  const handleRefreshTokenError = async (error: any) => {
    if (error?.message?.includes("refresh_token_not_found") || error?.message?.includes("Invalid Refresh Token")) {
      await supabase.auth.signOut()
      setUser(null)
      // Удаляем токен из localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`)
      }
    }
  }

  // Счётчик неавторизованных ошибок; по достижении порога перенаправляем на главную
  const trackUnauthorizedError = () => {
    setUnauthorizedCount((prev) => {
      const newCount = prev + 1
      if (newCount >= 4) {
        router.push("/")
        setUnauthorizedCount(0)
      }
      return newCount
    })
  }

  // Обнуляем счётчик, если есть пользователь
  useEffect(() => {
    if (user) {
      setUnauthorizedCount(0)
    }
  }, [user])

  // Инициализация пользователя и подписка на изменения сессии
  useEffect(() => {
    // Первичная загрузка пользователя
    const getInitialUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()
        if (error) {
          // При ошибке очищаем сессию и сбрасываем пользователя
          await handleRefreshTokenError(error)
          setUser(null)
        } else {
          setUser(user ?? null)
        }
      } catch (error) {
        await handleRefreshTokenError(error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getInitialUser()

    // Обновляем пользователя при изменении сессии
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  // Выход из аккаунта
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  // Обновление пользователя; ошибки обрабатываются молча
  const refreshUser = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()
      if (error) {
        setUser(null)
      } else {
        setUser(user)
      }
    } catch (_error) {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser, trackUnauthorizedError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
