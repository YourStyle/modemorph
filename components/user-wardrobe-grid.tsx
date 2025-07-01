"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertCircle } from "lucide-react"
import { CachedWardrobeImage } from "./cached-wardrobe-image"

interface WardrobeItem {
  id: string
  user_id: string
  item_name: string
  material: string
  color: string
  shade: string
  style: string
  has_print: string
  has_details: string
  image_url: string
  basic_item_id: string | null
  created_at: string
  updated_at: string
  is_visible: boolean
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log("Fetching wardrobe items...")
      const response = await fetch("/api/wardrobe-user-items")

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API Error:", response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text()
        console.error("Non-JSON response:", text)
        throw new Error("Server returned non-JSON response")
      }

      const data = await response.json()
      console.log("Received wardrobe data:", data)

      if (Array.isArray(data)) {
        setItems(data)
      } else {
        console.error("Expected array, got:", typeof data, data)
        setItems([])
      }
    } catch (err) {
      console.error("Error fetching wardrobe items:", err)
      setError(err instanceof Error ? err.message : "Неизвестная ошибка")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="aspect-square bg-gray-200 animate-pulse" />
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Ошибка загрузки</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={fetchItems} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Попробовать снова
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">👗</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Ваш гардероб пуст</h3>
        <p className="text-gray-600 mb-4">Добавьте первую вещь, загрузив фото на главной странице</p>
        <Button onClick={() => (window.location.href = "/app")}>Добавить вещи</Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative">
            <CachedWardrobeImage
              src={item.image_url}
              alt={item.item_name}
              className="w-full h-full object-cover"
              basicItemId={item.basic_item_id}
            />
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-lg mb-2 capitalize">{item.item_name}</h3>

            <div className="flex flex-wrap gap-2 mb-3">
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
            </div>

            {(item.has_print !== "no" || item.has_details !== "no") && (
              <div className="flex flex-wrap gap-2 mb-3">
                {item.has_print !== "no" && (
                  <Badge variant="secondary" className="text-xs">
                    Принт: {item.has_print}
                  </Badge>
                )}
                {item.has_details !== "no" && (
                  <Badge variant="secondary" className="text-xs">
                    Детали: {item.has_details}
                  </Badge>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500">Добавлено: {new Date(item.created_at).toLocaleDateString("ru-RU")}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
