"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"
import { Shirt, Calendar } from "lucide-react"

interface WardrobeItem {
  id: string
  item_name: string
  material?: string
  color?: string
  style?: string
  has_print?: string
  image_url?: string
  created_at: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch("/api/wardrobe-user-items")

        if (!response.ok) {
          throw new Error("Failed to fetch wardrobe items")
        }

        const data = await response.json()
        setItems(data.items || [])
      } catch (err) {
        console.error("Error fetching wardrobe items:", err)
        setError("Не удалось загрузить вещи")
      } finally {
        setLoading(false)
      }
    }

    fetchItems()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="aspect-square bg-gray-200 animate-pulse" />
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 animate-pulse rounded mb-2" />
              <div className="h-3 bg-gray-200 animate-pulse rounded w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Shirt className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Ошибка загрузки</h3>
        <p className="text-gray-600">{error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Shirt className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Ваш гардероб пуст</h3>
        <p className="text-gray-600 mb-4">Загрузите фото ваших вещей, чтобы начать создавать цифровой гардероб</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative bg-gray-50">
            <CachedWardrobeImage itemName={item.item_name} className="w-full h-full" alt={item.item_name} />
          </div>

          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{item.item_name}</h3>

            <div className="space-y-2 mb-3">
              {item.material && (
                <Badge variant="secondary" className="text-xs">
                  {item.material}
                </Badge>
              )}

              {item.color && (
                <Badge variant="outline" className="text-xs ml-1">
                  {item.color}
                </Badge>
              )}

              {item.style && (
                <Badge variant="outline" className="text-xs ml-1">
                  {item.style}
                </Badge>
              )}

              {item.has_print && item.has_print !== "нет" && (
                <Badge variant="outline" className="text-xs ml-1">
                  {item.has_print}
                </Badge>
              )}
            </div>

            <div className="flex items-center text-xs text-gray-500">
              <Calendar className="h-3 w-3 mr-1" />
              {new Date(item.created_at).toLocaleDateString("ru-RU")}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
