"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { TopNavigation } from "@/components/top-navigation"
import { BottomNavigation } from "@/components/bottom-navigation"
import { BackgroundTasksWidget } from "@/components/background-tasks-widget"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { TryOnSheet } from "@/components/try-on-sheet"
import { WelcomeGiftGate } from "@/components/welcome-gift-gate"
import { useAddToCloset } from "@/contexts/add-to-closet-context"
import { cn } from "@/lib/utils"

export default function AppClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hideTopNavigation = pathname?.startsWith("/app/inspiration") ?? false
  const isAssistant = pathname?.startsWith("/app/ai-assistant") ?? false
  const { isOpen, initialPhotos, closeSheet, onAnalysisSuccess } = useAddToCloset()

  const [isTmaIos, setIsTmaIos] = useState(false)

  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp
      const hasInit = !!tg?.initData && String(tg.initData).trim().length > 0
      const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
      const platform = String(tg?.platform || "").toLowerCase()
      const inTma = hasInit && hasUser && platform && platform !== "unknown"
      if (inTma && /ios/.test(platform)) {
        setIsTmaIos(true)
      }
    } catch {
      // ignore
    }
  }, [])

  console.log("[AppClientLayout] Rendering")

  // Убрана проверка сессии - этим занимается MiniAppRegistrationGate

  return (
    <div className="min-h-screen bg-background">
      {!hideTopNavigation && <TopNavigation />}
      <main
        className={cn("pt-0 max-w-7xl m-auto", isAssistant ? "pb-0" : "pb-10")}
        style={isTmaIos && !hideTopNavigation ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 70px)" } : undefined}
      >
        {children}
      </main>
      <BottomNavigation />
      <BackgroundTasksWidget />
      <TryOnSheet />
      <WelcomeGiftGate />

      <AddToClosetSheet
        isOpen={isOpen}
        onClose={closeSheet}
        initialPhotos={initialPhotos}
        onAnalysisSuccess={onAnalysisSuccess || undefined}
      />
    </div>
  )
}
