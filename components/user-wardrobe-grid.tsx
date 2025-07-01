"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"
import { Loader2 } from "lucide-react"

interface WardrobeItem {
  id: string
  name: string
  color?: string
  style?: string
  print?: string
  material?: string
  image_url?: string
  basic_item_id?: string
  created_at: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadWardrobeItems() {
      try {
        const response = await fetch("/api/wardrobe-user-items")
        if (!response.ok) {
          throw new Error("Ошибка загрузки гардероба")
        }
        const data = await response.json()
        setItems(data.items || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
      } finally {
        setLoading(false)
      }
    }

    loadWardrobeItems()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600">Загрузка гардероба...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Ваш гардероб пока пуст</p>
        <p className="text-sm text-gray-500">Добавьте вещи через форму загрузки фото</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative bg-gray-50">
            <CachedWardrobeImage
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-cover"
              basicItemId={item.basic_item_id}
            />
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-lg mb-2 line-clamp-2">{item.name}</h3>

            <div className="flex flex-wrap gap-2 mb-3">
              {item.material && (
                <Badge variant="secondary" className="text-xs">
                  {item.material}
                </Badge>
              )}
              {item.color && (
                <Badge variant="outline" className="text-xs">
                  {item.color}
                </Badge>
              )}
              {item.style && (
                <Badge variant="outline" className="text-xs">
                  {item.style}
                </Badge>
              )}
              {item.print && (
                <Badge variant="outline" className="text-xs">
                  {item.print}
                </Badge>
              )}
            </div>

            <p className="text-xs text-gray-500">Добавлено: {new Date(item.created_at).toLocaleDateString("ru-RU")}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
