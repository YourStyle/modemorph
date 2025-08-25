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

  const handleRefreshTokenError = async (error: any) => {
    if (error?.message?.includes("refresh_token_not_found") || error?.message?.includes("Invalid Refresh Token")) {
      console.log("[v0] Clearing invalid session due to refresh token error")
      await supabase.auth.signOut()
      setUser(null)
      // Clear any stale session data
      if (typeof window !== "undefined") {
        localStorage.removeItem(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`)
      }
    }
  }

  const trackUnauthorizedError = () => {
    setUnauthorizedCount((prev) => {
      const newCount = prev + 1
      console.log(`[v0] Unauthorized error count: ${newCount}`)

      if (newCount >= 4) {
        console.log("[v0] Too many unauthorized errors, redirecting to home")
        router.push("/")
        setUnauthorizedCount(0)
      }

      return newCount
    })
  }

  useEffect(() => {
    if (user) {
      setUnauthorizedCount(0)
    }
  }, [user])

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()
        if (error) {
          console.error("Error getting session:", error)
          await handleRefreshTokenError(error)
        } else {
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
        await handleRefreshTokenError(error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[v0] Auth state changed:", event, !!session?.user)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshUser = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()
      if (error) {
        console.error("Error refreshing user:", error)
        setUser(null)
      } else {
        setUser(user)
      }
    } catch (error) {
      console.error("Error refreshing user:", error)
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
