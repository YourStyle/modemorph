"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string
  role: "admin" | "user"
}

interface AuthRedirectProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireAdmin?: boolean
  redirectTo?: string
}

export function AuthRedirect({
  children,
  requireAuth = false,
  requireAdmin = false,
  redirectTo = "/auth/login",
}: AuthRedirectProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const getSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchOrCreateProfile(session.user)
        }
      } catch (error) {
        console.error("Error getting session:", error)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)

      if (session?.user) {
        await fetchOrCreateProfile(session.user)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchOrCreateProfile = async (user: User) => {
    try {
      // Try to get existing profile
      let response = await fetch("/api/user-profile")

      if (!response.ok) {
        // If profile doesn't exist, create it
        response = await fetch("/api/user-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            full_name: user.user_metadata?.full_name || "",
            avatar_url: user.user_metadata?.avatar_url || "",
          }),
        })
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
          const profileData = await response.json()
          setProfile(profileData)
        }
      }
    } catch (error) {
      console.error("Error fetching/creating profile:", error)
      // Set default profile if API fails
      setProfile({
        id: user.id,
        email: user.email || "",
        full_name: user.user_metadata?.full_name || "",
        avatar_url: user.user_metadata?.avatar_url || "",
        role: "user",
      })
    }
  }

  useEffect(() => {
    if (!loading) {
      if (requireAuth && !user) {
        router.push(redirectTo)
        return
      }

      if (requireAdmin && (!profile || profile.role !== "admin")) {
        router.push("/app")
        return
      }

      // Redirect based on role and current path
      if (user && profile) {
        const currentPath = window.location.pathname

        if (currentPath === "/" || currentPath === "/auth/login" || currentPath === "/auth/sign-up") {
          if (profile.role === "admin") {
            router.push("/admin")
          } else {
            router.push("/app")
          }
        }
      }
    }
  }, [user, profile, loading, requireAuth, requireAdmin, redirectTo, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (requireAuth && !user) {
    return null
  }

  if (requireAdmin && (!profile || profile.role !== "admin")) {
    return null
  }

  return <>{children}</>
}
