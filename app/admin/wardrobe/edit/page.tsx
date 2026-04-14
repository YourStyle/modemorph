"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { EditWardrobeItemForm } from "@/components/edit-wardrobe-item-form"
import { useAuth } from "@/contexts/auth-context"
import {api} from "@/lib/api-client";

export default function EditWardrobeItemPage() {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { loading: authLoading } = useAuth()

  const itemId = searchParams.get("id")

  useEffect(() => {
    if (!itemId) {
      setError("ID вещи не указан")
      setLoading(false)
      return
    }

    const fetchItem = async () => {
      try {
        const data = await api.get(`/api/wardrobe/${itemId}`)
        setItem(data.item || data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    }

    void fetchItem()
  }, [itemId])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">Загрузка...</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">Загрузка вещи...</div>
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Ошибка</div>
          <p className="text-gray-600">{error || "Вещь не найдена"}</p>
          <Link href="/admin/wardrobe">
            <Button>Вернуться к гардеробу</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Navigation */}
          <div className="mb-6">
            <Link href="/admin/wardrobe">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад к гардеробу
              </Button>
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Редактировать вещь</h1>
            <p className="text-gray-600">Обновите информацию о вещи в гардеробе</p>
          </div>

          {/* Edit Form */}
          <EditWardrobeItemForm item={item} />
        </div>
      </div>
    </div>
  )
}
