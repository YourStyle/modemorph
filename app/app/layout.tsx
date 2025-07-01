import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { getUserProfile } from "@/lib/admin"

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

  // Получаем профиль пользователя
  const profile = await getUserProfile(user.id)

  // Если пользователь админ, перенаправляем в админку
  if (profile?.is_admin) {
    redirect("/admin")
  }

  const userWithRole = {
    id: user.id,
    email: user.email,
    isAdmin: false,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation user={userWithRole} />
      <main className="py-8">{children}</main>
    </div>
  )
}
