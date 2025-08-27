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
  const supabase = supabaseRef.current
  const router = useRouter()
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.setAuthContext?.({ trackUnauthorizedError })
    }
  }, [])

  const handleRefreshTokenError = async (error: any) => {
    if (error?.message?.includes("refresh_token_not_found") || error?.message?.includes("Invalid Refresh Token")) {
      await supabase.auth.signOut()
      setUser(null)
      if (typeof window !== "undefined") {
        localStorage.removeItem(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`)
      }
    }
  }

  const trackUnauthorizedError = () => {
    setUnauthorizedCount((prev) => {
      const newCount = prev + 1
      console.log(`[v0] 401 error count: ${newCount}`)
      if (newCount >= 4 && !redirectTimeoutRef.current) {
        console.log(`[v0] Redirecting to homepage due to ${newCount} 401 errors`)
        redirectTimeoutRef.current = setTimeout(() => {
          router.push("/")
          setUnauthorizedCount(0)
          redirectTimeoutRef.current = null
        }, 100)
      }
      return newCount
    })
  }

  useEffect(() => {
    if (user) {
      setUnauthorizedCount(0)
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
        redirectTimeoutRef.current = null
      }
    }
  }, [user])

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const getInitialUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()
        if (error) {
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
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
