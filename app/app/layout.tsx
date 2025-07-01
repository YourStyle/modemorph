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
        <main className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </>
  )
}
