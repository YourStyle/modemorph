import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navigation } from "@/components/navigation"

async function getUserProfile(userId: string) {
  const supabase = createClient()

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching profile:", error)
    return null
  }

  return profile
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Проверяем профиль пользователя
  const profile = await getUserProfile(user.id)

  // Если пользователь админ, перенаправляем в админку
  if (profile?.is_admin) {
    redirect("/admin")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
