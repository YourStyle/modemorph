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

  return (
    <>
      <Navigation user={{ email: user.email, isAdmin: false }} />
      <main>{children}</main>
    </>
  )
}
