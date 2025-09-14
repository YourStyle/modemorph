"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { YandexMigrationCard } from "@/components/yandex-migration-card"
import { FixCorruptedFilesCard } from "@/components/fix-corrupted-files-card"
import { Loader2 } from "lucide-react"

export default function AdminSettingsPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const checkAdminAccess = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      // Проверяем права администратора
      const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

      if (!profile?.is_admin) {
        router.push("/app")
        return
      }

      setIsAdmin(true)
    } catch (error) {
      console.error("Error checking admin access:", error)
      router.push("/app")
    } finally {
      setCheckingAuth(false)
    }
  }

  useEffect(() => {
    checkAdminAccess()
  }, [])

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Доступ запрещен</div>
          <p className="text-gray-600">У вас нет прав администратора</p>
          <button
            onClick={() => router.push("/app")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Вернуться в приложение
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки администратора</h1>
        <p className="text-muted-foreground">Управление миграцией данных и исправление файлов</p>
      </div>

      <div className="grid gap-6">
        <YandexMigrationCard />
        <FixCorruptedFilesCard />
      </div>
    </div>
  )
}
