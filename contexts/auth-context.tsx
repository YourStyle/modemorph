"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const handleRefreshTokenError = async (error: any) => {
    if (
      error?.message?.includes("refresh_token_not_found") ||
      error?.message?.includes("Invalid Refresh Token") ||
      error?.code === "refresh_token_not_found"
    ) {
      console.log("[v0] Invalid refresh token detected, clearing session")
      // Clear invalid session data
      await supabase.auth.signOut({ scope: "local" })
      setUser(null)
      // Clear any cached auth data
      if (typeof window !== "undefined") {
        localStorage.removeItem("supabase.auth.token")
        // Clear all supabase auth cookies
        document.cookie.split(";").forEach((c) => {
          if (c.trim().startsWith("sb-")) {
            const eqPos = c.indexOf("=")
            const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim()
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
          }
        })
      }
      return true
    }
    return false
  }

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
          const handled = await handleRefreshTokenError(error)
          if (!handled) {
            setUser(null)
          }
        } else {
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error("Error getting initial session:", error)
        const handled = await handleRefreshTokenError(error)
        if (!handled) {
          setUser(null)
        }
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

      if (event === "TOKEN_REFRESHED" && !session) {
        console.log("[v0] Token refresh failed, clearing session")
        await handleRefreshTokenError({ code: "refresh_token_not_found" })
      } else {
        setUser(session?.user ?? null)
      }
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
        const handled = await handleRefreshTokenError(error)
        if (!handled) {
          setUser(null)
        }
      } else {
        setUser(user)
      }
    } catch (error) {
      console.error("Error refreshing user:", error)
      const handled = await handleRefreshTokenError(error)
      if (!handled) {
        setUser(null)
      }
    }
  }

  return <AuthContext.Provider value={{ user, loading, signOut, refreshUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
