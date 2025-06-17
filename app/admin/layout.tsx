import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navigation } from "@/components/navigation"

export default async function AdminLayout({
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

  // Проверяем права администратора
  const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

  if (!profile?.is_admin) {
    redirect("/app")
  }

  return (
    <>
      <Navigation user={{ email: user.email, isAdmin: true }} />
      <main>{children}</main>
    </>
  )
}
