"use client"

import { AddWardrobeItemForm } from "@/components/add-wardrobe-item-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

export default function AddWardrobeItemPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">Загрузка...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Необходима авторизация</div>
          <Button onClick={() => router.push("/auth/login")}>Войти</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Навигация */}
          <div className="mb-6">
            <Link href="/admin/wardrobe">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад к гардеробу
              </Button>
            </Link>
          </div>

          {/* Заголовок */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Добавить новую вещь</h1>
            <p className="text-gray-600">Заполните форму, чтобы добавить новую вещь в свой гардероб</p>
          </div>

          {/* Форма добавления */}
          <AddWardrobeItemForm />
        </div>
      </div>
    </div>
  )
}
