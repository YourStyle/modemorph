"use client"

import type React from "react"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { TopNavigation } from "@/components/top-navigation"
import { BottomNavigation } from "@/components/bottom-navigation"
import { BackgroundTasksWidget } from "@/components/background-tasks-widget"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { cn } from "@/lib/utils"

export default function AppClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hideTopNavigation = pathname?.startsWith("/app/inspiration") ?? false
  const isAssistant = pathname?.startsWith("/app/ai-assistant") ?? false
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideTopNavigation && <TopNavigation />}
      <main className={cn("pt-0 max-w-7xl m-auto", isAssistant ? "pb-0" : "pb-10")}>{children}</main>
      <BottomNavigation />
      <BackgroundTasksWidget onOpenSheet={() => setIsAddSheetOpen(true)} />
      <AddToClosetSheet
        isOpen={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
      />
    </div>
  )
}
