"use client"

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react"
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
  const supabaseRef = useRef(createClient())
  const router = useRouter()
  const authListenerRef = useRef<any>(null)

  const handleRefreshTokenError = async (error: any) => {
    if (error?.message?.includes("refresh_token_not_found") || error?.message?.includes("Invalid Refresh Token")) {
      console.log("[v0] Clearing invalid session due to refresh token error")
      await supabaseRef.current.auth.signOut()
      setUser(null)
      // Clear any stale session data
      if (typeof window !== "undefined") {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]
        localStorage.removeItem(`sb-${supabaseUrl}-auth-token`)
        Object.keys(localStorage).forEach((key) => {
          if (key.includes("supabase") || key.includes("sb-")) {
            localStorage.removeItem(key)
          }
        })
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
    if (authListenerRef.current) {
      return
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabaseRef.current.auth.getSession()
        if (error) {
          console.error("Error getting session:", error)
          await handleRefreshTokenError(error)
        } else {
          setUser(session?.user ?? null)
          console.log("[v0] Initial session loaded:", !!session?.user)
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
        await handleRefreshTokenError(error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    let debounceTimer: NodeJS.Timeout
    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        console.log("[v0] Auth state changed:", event, !!session?.user)
        setUser(session?.user ?? null)
        setLoading(false)
      }, 100)
    })

    authListenerRef.current = subscription

    return () => {
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe()
        authListenerRef.current = null
      }
      clearTimeout(debounceTimer)
    }
  }, []) // Remove supabase.auth dependency to prevent re-runs

  const signOut = async () => {
    await supabaseRef.current.auth.signOut()
    setUnauthorizedCount(0)
  }

  const refreshUser = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabaseRef.current.auth.getUser()
      if (error) {
        console.error("Error refreshing user:", error)
        await handleRefreshTokenError(error)
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
