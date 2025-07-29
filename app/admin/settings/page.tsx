"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { YandexMigrationCard } from "@/components/yandex-migration-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Settings, Database, Upload } from "lucide-react"

export default function AdminSettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAdminAccess()
  }, [])

  const checkAdminAccess = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        router.push("/auth/login")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("isAdmin")
        .eq("id", user.id)
        .single()

      if (profileError || !profile?.isAdmin) {
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

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Настройки администратора
          </h1>
          <p className="text-muted-foreground">Управление системными настройками и миграцией данных</p>
        </div>

        <Separator />

        {/* Секция миграции */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Миграция данных</h2>
          </div>

          <div className="grid gap-6">
            <YandexMigrationCard />
          </div>
        </div>

        {/* Информационная карточка */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />О миграции
            </CardTitle>
            <CardDescription>Информация о процессе миграции изображений</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Что происходит при миграции:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Сканирование всех таблиц с изображениями</li>
                <li>• Скачивание файлов из Vercel Blob</li>
                <li>• Загрузка в Yandex S3 с сохранением структуры папок</li>
                <li>• Обновление URL в базе данных</li>
                <li>• Обработка файлов батчами для стабильности</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Обрабатываемые таблицы:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• wardrobe_items</li>
                <li>• wardrobe_user_items</li>
                <li>• basic_wardrobe_items</li>
                <li>• outfits</li>
                <li>• user_looks</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
