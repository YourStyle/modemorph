"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthRedirectProps {
  userId: string
}

export function AuthRedirect({ userId }: AuthRedirectProps) {
  const router = useRouter()

  useEffect(() => {
    async function checkUserRole() {
      const supabase = createClient()

      try {
        // Проверяем профиль пользователя
        const { data: profile, error } = await supabase
          .from("user_profiles")
          .select("is_admin")
          .eq("user_id", userId)
          .single()

        if (error || !profile) {
          // Если профиля нет, создаем его как админа
          const { error: insertError } = await supabase.from("user_profiles").insert({
            user_id: userId,
            is_admin: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

          if (!insertError) {
            router.push("/admin")
          } else {
            router.push("/app")
          }
        } else {
          // Перенаправляем в зависимости от роли
          if (profile.is_admin) {
            router.push("/admin")
          } else {
            router.push("/app")
          }
        }
      } catch (error) {
        console.error("Error checking user role:", error)
        router.push("/app")
      }
    }

    checkUserRole()
  }, [userId, router])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Перенаправление...</p>
      </div>
    </div>
  )
}
