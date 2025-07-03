"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface UserProfile {
  id: string
  user_id: string
  email: string
  is_admin: boolean
  created_at: string
  updated_at: string
}

interface AuthRedirectProps {
  children: React.ReactNode
  adminRedirect?: string
  userRedirect?: string
}

export function AuthRedirect({ children, adminRedirect = "/admin", userRedirect }: AuthRedirectProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error || !user) {
          router.push("/auth/login")
          return
        }

        setUser(user)

        // Get or create user profile
        const profileResponse = await fetch("/api/user-profile")

        if (profileResponse.ok) {
          const { profile } = await profileResponse.json()

          if (profile) {
            setProfile(profile)

            // Redirect based on role
            if (profile.is_admin && adminRedirect) {
              router.push(adminRedirect)
              return
            } else if (!profile.is_admin && userRedirect) {
              router.push(userRedirect)
              return
            }
          } else {
            // Create profile if it doesn't exist
            const createResponse = await fetch("/api/user-profile", {
              method: "POST",
            })

            if (createResponse.ok) {
              const { profile: newProfile } = await createResponse.json()
              setProfile(newProfile)

              // Redirect new user (default to user area)
              if (userRedirect) {
                router.push(userRedirect)
                return
              }
            }
          }
        }
      } catch (error) {
        console.error("Error checking user:", error)
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkUser()
  }, [router, adminRedirect, userRedirect])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return null
  }

  return <>{children}</>
}
