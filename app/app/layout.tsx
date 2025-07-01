import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navigation } from "@/components/navigation"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Проверяем роль пользователя
  const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

  // Если это админ, перенаправляем в админку
  if (profile?.is_admin) {
    redirect("/admin")
  }

  return (
    <div className="min-h-screen">
      <Navigation user={{ email: user.email, isAdmin: false }} />
      <main>{children}</main>
    </div>
  )
}
