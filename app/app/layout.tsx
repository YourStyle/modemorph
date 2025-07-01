import type React from "react"
import { AuthRedirect } from "@/components/auth-redirect"
import { Navigation } from "@/components/navigation"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthRedirect adminRedirect="/admin">
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </AuthRedirect>
  )
}
