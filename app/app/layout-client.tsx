"use client"

import type React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { TopNavigation } from "@/components/top-navigation"
import { BottomNavigation } from "@/components/bottom-navigation"
import { BackgroundTasksWidget } from "@/components/background-tasks-widget"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { useAddToCloset } from "@/contexts/add-to-closet-context"
import { cn } from "@/lib/utils"
import { sessionAuth } from "@/lib/tma/session-auth"

export default function AppClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const hideTopNavigation = pathname?.startsWith("/app/inspiration") ?? false
  const isAssistant = pathname?.startsWith("/app/ai-assistant") ?? false
  const { isOpen, initialPhotos, closeSheet, onAnalysisSuccess } = useAddToCloset()

  console.log("[AppClientLayout] Rendering with isOpen:", isOpen, "initialPhotos:", initialPhotos)

  // Проверка авторизации с ожиданием handshake
  useEffect(() => {
    let attempts = 0
    const maxAttempts = 10 // 10 попыток по 500ms = 5 секунд ожидания
    
    const checkAuth = () => {
      attempts++
      console.log(`[AppClientLayout] Auth check attempt ${attempts}/${maxAttempts}`)
      
      // Проверяем есть ли валидная сессия
      if (sessionAuth.hasValidSession()) {
        const accessToken = sessionAuth.getAccessToken()
        if (accessToken) {
          console.log("[AppClientLayout] User is authorized")
          setIsCheckingAuth(false)
          return
        }
      }
      
      // Если не авторизован и ещё есть попытки - ждём handshake
      if (attempts < maxAttempts) {
        console.log("[AppClientLayout] No session yet, waiting for handshake...")
        setTimeout(checkAuth, 500)
        return
      }
      
      // Превышено количество попыток
      console.log("[AppClientLayout] Max attempts reached, redirecting to /")
      router.replace("/")
    }

    // Небольшая задержка перед первой проверкой чтобы дать handshake время
    setTimeout(checkAuth, 300)
  }, [router])

  // Показываем loader пока проверяем авторизацию
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideTopNavigation && <TopNavigation />}
      <main className={cn("pt-0 max-w-7xl m-auto", isAssistant ? "pb-0" : "pb-10")}>{children}</main>
      <BottomNavigation />
      <BackgroundTasksWidget />

      {/* Глобальная шторка для добавления вещей */}
      <AddToClosetSheet
        isOpen={isOpen}
        onClose={closeSheet}
        initialPhotos={initialPhotos}
        onAnalysisSuccess={onAnalysisSuccess || undefined}
      />
    </div>
  )
}
