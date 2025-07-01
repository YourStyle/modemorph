"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function AuthRedirect() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          router.push("/auth/login")
          return
        }

        // Проверяем профиль пользователя
        try {
          const response = await fetch("/api/user-profile")

          if (response.ok) {
            const { profile } = await response.json()

            if (profile?.is_admin) {
              router.push("/admin")
            } else {
              router.push("/app")
            }
          } else {
            // Если профиль не найден, создаем его
            const createResponse = await fetch("/api/user-profile", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                full_name: session.user.user_metadata?.full_name || "",
                avatar_url: session.user.user_metadata?.avatar_url || "",
              }),
            })

            if (createResponse.ok) {
              const { profile } = await createResponse.json()

              if (profile?.is_admin) {
                router.push("/admin")
              } else {
                router.push("/app")
              }
            } else {
              // Fallback - отправляем в пользовательскую зону
              router.push("/app")
            }
          }
        } catch (error) {
          console.error("Error checking profile:", error)
          // Fallback - отправляем в пользовательскую зону
          router.push("/app")
        }
      } catch (error) {
        console.error("Error in auth redirect:", error)
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return null
}
