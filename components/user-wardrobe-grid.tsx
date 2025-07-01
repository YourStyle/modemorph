"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"
import { Shirt, Calendar, Loader2 } from "lucide-react"

interface WardrobeItem {
  id: string
  item_name: string
  material?: string
  color?: string
  shade?: string
  style?: string
  has_print?: string
  has_details?: string
  image_url?: string
  basic_item_id?: string
  created_at: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchItems = async () => {
      try {
        console.log("Fetching wardrobe items...")
        const response = await fetch("/api/wardrobe-user-items")

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        console.log("Received wardrobe data:", data)

        // Данные приходят напрямую как массив
        setItems(Array.isArray(data) ? data : [])
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">Загрузка гардероба...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Shirt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ошибка загрузки</h3>
          <p className="text-gray-600">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Shirt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ваш гардероб пуст</h3>
          <p className="text-gray-600">Загрузите фото ваших вещей, чтобы начать создавать свой цифровой гардероб</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative bg-gray-50">
            <CachedWardrobeImage
              src={item.image_url}
              alt={item.item_name}
              className="w-full h-full object-cover"
              basicItemId={item.basic_item_id}
            />
          </div>

          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{item.item_name}</h3>

            <div className="flex flex-wrap gap-1 mb-3">
              {item.material && (
                <Badge variant="secondary" className="text-xs">
                  {item.material}
                </Badge>
              )}

              {item.shade && (
                <Badge variant="outline" className="text-xs">
                  {item.shade}
                </Badge>
              )}

              {item.style && (
                <Badge variant="outline" className="text-xs">
                  {item.style}
                </Badge>
              )}

              {item.has_print && item.has_print !== "no" && (
                <Badge variant="outline" className="text-xs">
                  {item.has_print}
                </Badge>
              )}

              {item.has_details && item.has_details !== "no" && (
                <Badge variant="outline" className="text-xs">
                  {item.has_details}
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
