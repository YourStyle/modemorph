"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { TopNavigation } from "@/components/top-navigation"
import { BottomNavigation } from "@/components/bottom-navigation"
import { BackgroundTasksWidget } from "@/components/background-tasks-widget"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { TryOnSheet } from "@/components/try-on-sheet"
import { WelcomeGiftGate } from "@/components/welcome-gift-gate"
import { useAddToCloset } from "@/contexts/add-to-closet-context"
import { useTmaMobile, useTmaSafeArea } from "@/hooks/use-tma"
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

  // Единственное место, где подписываемся на реальные инсеты Telegram —
  // выставляет --tg-top на :root (hooks/use-tma.ts → lib/tma/safe-area.ts).
  // Все остальные компоненты просто читают этот CSS var.
  useTmaSafeArea()
  // Тот же флаг, что решает, рендерить ли TopNavigation свой плавающий
  // pill-хедер (iOS и Android ведут себя одинаково — Telegram оверлеит
  // свою чрому поверх контента на обеих мобильных платформах), а не только
  // для iOS: раньше отступ добавлялся только на iOS, и Android оставался
  // без компенсации вовсе.
  const isTmaMobile = useTmaMobile()

  console.log("[AppClientLayout] Rendering")

  // Убрана проверка сессии - этим занимается MiniAppRegistrationGate

  return (
    <div className="min-h-screen bg-background">
      {!hideTopNavigation && <TopNavigation />}
      {/* Верхний паддинг = реальный инсет Telegram (--tg-top, с фолбэком на
          env()) + высота содержимого плавающей шапки (--tg-nav-content-h,
          токен в app/globals.css) — та же формула, что и у backdrop-подложки
          в top-navigation.tsx, посчитана, а не угадана числом 70px. */}
      <main
        className={cn(
          "pt-0 max-w-7xl m-auto",
          isAssistant ? "pb-0" : "pb-[calc(env(safe-area-inset-bottom,0px)+96px)]",
        )}
        style={
          isTmaMobile && !hideTopNavigation
            ? {
                paddingTop:
                  "calc(var(--tg-top, env(safe-area-inset-top, 0px)) + var(--tg-nav-content-h, 52px))",
              }
            : undefined
        }
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
