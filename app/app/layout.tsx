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
      <AuthRedirect adminRedirect="/admin" />
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</main>
      </div>
    </>
  )
}
