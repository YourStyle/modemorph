"use client"

import type React from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { api } from "@/lib/api-client"
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
  // выставляет --tg-chrome на :root (hooks/use-tma.ts → lib/tma/safe-area.ts).
  // Все остальные компоненты просто читают этот CSS var.
  useTmaSafeArea()
  // Тот же флаг, что решает, рендерить ли TopNavigation свой плавающий
  // pill-хедер (iOS и Android ведут себя одинаково — Telegram оверлеит
  // свою чрому поверх контента на обеих мобильных платформах), а не только
  // для iOS: раньше отступ добавлялся только на iOS, и Android оставался
  // без компенсации вовсе.
  const isTmaMobile = useTmaMobile()

  // Открытие по кнопке из рассылки бота. Ссылка вида t.me/<bot>?startapp=bc<id>
  // приходит в initDataUnsafe.start_param; пишем одно событие на сессию, чтобы
  // в админке рядом с рассылкой был счётчик кликов (broadcast_open).
  useEffect(() => {
    const param: string | undefined = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param
    if (!param || !/^bc\d+$/.test(param)) return
    const key = `broadcast_open:${param}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch {}
    void api
      .post("/api/usage/log", {
        feature: "broadcast_open",
        action: "click",
        meta: { broadcast_id: param.slice(2), start_param: param },
      })
      .catch(() => {})
  }, [])

  console.log("[AppClientLayout] Rendering")

  // Убрана проверка сессии - этим занимается MiniAppRegistrationGate

  return (
    <div className="min-h-screen bg-background">
      {!hideTopNavigation && <TopNavigation />}
      {/* Верхний паддинг — тот же токен --tg-content-top (app/globals.css), что
          у стеклянной подложки шапки: инсет Telegram + зазор + высота пилюли.
          Держим одну величину на всех потребителей: когда формулу считали в
          каждом файле отдельно, пилюля уезжала вниз на собственную высоту. */}
      <main
        className={cn(
          "pt-0 max-w-7xl m-auto",
          isAssistant ? "pb-0" : "pb-[calc(var(--sab,env(safe-area-inset-bottom,0px))+96px)]",
        )}
        style={
          isTmaMobile && !hideTopNavigation
            ? {
                paddingTop: "calc(var(--tg-content-top) + var(--tg-hint-h, 0px))",
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
