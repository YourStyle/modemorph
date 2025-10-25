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

  // Проверка авторизации
  useEffect(() => {
    const checkAuth = () => {
      // Проверяем есть ли валидная сессия
      if (!sessionAuth.hasValidSession()) {
        console.log("[AppClientLayout] No valid session, redirecting to /")
        router.replace("/")
        return
      }

      const accessToken = sessionAuth.getAccessToken()
      if (!accessToken) {
        console.log("[AppClientLayout] No access token, redirecting to /")
        router.replace("/")
        return
      }

      console.log("[AppClientLayout] User is authorized")
      setIsCheckingAuth(false)
    }

    checkAuth()
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
