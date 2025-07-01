"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw } from "lucide-react"
import { CachedWardrobeImage } from "./cached-wardrobe-image"

interface WardrobeItem {
  id: number
  user_id: string
  item_name: string
  material: string
  color: string
  shade: string
  style: string
  has_print: boolean
  has_details: boolean
  image_url: string
  basic_item_id: number | null
  created_at: string
  updated_at: string
  is_visible: boolean
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/wardrobe-user-items")

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${await response.text()}`)
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(`Expected JSON response but got ${contentType}`)
      }

      const data = await response.json()
      console.log("Wardrobe items:", data)
      setItems(data)
    } catch (err) {
      console.error("Error fetching wardrobe items:", err)
      setError(err instanceof Error ? err.message : "Произошла ошибка при загрузке гардероба")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-500">Загружаем ваш гардероб...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <Button onClick={fetchItems} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Попробовать снова
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-gray-500 mb-4">В вашем гардеробе пока нет вещей</div>
        <p className="text-gray-400 mb-6 max-w-md">
          Загрузите фотографии ваших вещей, чтобы начать создавать стильные образы
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div className="aspect-square relative">
            <CachedWardrobeImage
              src={item.image_url}
              alt={item.item_name}
              className="w-full h-full object-cover"
              fallbackSrc="/placeholder.svg?height=300&width=300"
            />
          </div>
          <CardContent className="p-4">
            <h3 className="font-medium text-lg mb-2 capitalize">{item.item_name}</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary">{item.material}</Badge>
              <Badge variant="outline">{item.shade}</Badge>
            </div>
            <p className="text-sm text-gray-500 capitalize">{item.style}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
