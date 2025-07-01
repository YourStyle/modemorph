"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"

interface WardrobeItem {
  id: string
  name: string
  clothing_type: string
  color: string
  material: string
  style?: string
  print?: string
  image_url?: string
  basic_item_id?: string
  created_at: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchItems() {
      try {
        const response = await fetch("/api/wardrobe-user-items")
        if (!response.ok) {
          throw new Error("Failed to fetch items")
        }
        const data = await response.json()
        setItems(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchItems()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Ошибка загрузки: {error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ваш гардероб пуст</h3>
          <p className="text-gray-600 mb-4">
            Загрузите фото ваших вещей, чтобы начать создавать свой цифровой гардероб
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative bg-gray-100">
            <CachedWardrobeImage
              src={item.image_url || ""}
              alt={item.name}
              className="w-full h-full object-cover"
              basicItemId={item.basic_item_id}
            />
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{item.name}</h3>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs">
                  {item.material}
                </Badge>
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

              <p className="text-xs text-gray-500">
                Добавлено: {new Date(item.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
