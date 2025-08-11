"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { TopNavigation } from "@/components/top-navigation"
import { BottomNavigation } from "@/components/bottom-navigation"

export default function AppClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hideTopNavigation = pathname?.startsWith("/app/inspiration") ?? false

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideTopNavigation && <TopNavigation />}
      <main className="pb-10 pt-0 max-w-7xl m-auto">{children}</main>
      <BottomNavigation />
    </div>
  )
}
