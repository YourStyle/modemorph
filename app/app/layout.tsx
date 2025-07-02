import type React from "react"
import { TopNavigation } from "@/components/top-navigation"
import { BottomNavigation } from "@/components/bottom-navigation"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavigation />
      <main className="pb-24 pt-0">{children}</main>
      <BottomNavigation />
    </div>
  )
}
