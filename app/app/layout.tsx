import type React from "react"
import { Navigation } from "@/components/navigation"
import { AuthRedirect } from "@/components/auth-redirect"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <AuthRedirect adminRedirect="/admin" userRedirect="/app" />
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="py-8">{children}</main>
      </div>
    </>
  )
}
