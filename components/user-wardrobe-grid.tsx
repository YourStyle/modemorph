"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, Shirt, Calendar } from "lucide-react"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"
import { PastelLoader } from "./pastel-loader"

interface UserWardrobeItem {
  id: number
  user_id: string
  item_name: string
  size_type: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  url: string
  created_at: string
  updated_at: string
  is_basic: boolean
  basic_item_id: number | null
  notes: string
  basic_material_id: number | null
  is_hidden: boolean
  image_url: string | null
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<UserWardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchItems = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/wardrobe-user-items")
      if (!response.ok) {
        throw new Error("Не удалось загрузить вещи")
      }

      const data = await response.json()
      console.log("Fetched wardrobe items:", data)
      setItems(data)
    } catch (err) {
      console.error("Error fetching wardrobe items:", err)
      setError("Ошибка загрузки гардероба")
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить ваш гардероб",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <PastelLoader size={60} />
        <p className="text-gray-600 mt-6 text-lg">Загружаем ваш гардероб...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <div className="max-w-md mx-auto">
          <Shirt className="h-16 w-16 text-gray-300 mx-auto mb-6" />
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Ошибка загрузки</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={fetchItems} variant="outline" className="rounded-full bg-transparent">
            <RefreshCw className="h-4 w-4 mr-2" />
            Попробовать снова
          </Button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="max-w-md mx-auto">
          <Shirt className="h-16 w-16 text-gray-300 mx-auto mb-6" />
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Ваш гардероб пуст</h3>
          <p className="text-gray-600">Добавьте первую вещь, загрузив фото одежды</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-800">Мои вещи</h2>
          <Badge variant="secondary" className="text-sm px-3 py-1 rounded-full">
            {items.length} {items.length === 1 ? "вещь" : items.length < 5 ? "вещи" : "вещей"}
          </Badge>
        </div>
        <Button onClick={fetchItems} variant="outline" size="sm" className="rounded-full bg-transparent">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {items.map((item) => (
          <Card
            key={item.id}
            className="overflow-hidden hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-white rounded-2xl"
          >
            <div className="aspect-square relative bg-gray-50 rounded-t-2xl overflow-hidden">
              {item.image_url ? (
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.item_name || "Вещь"}
                  fill
                  className="object-cover hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onError={(e) => {
                    console.log("Image failed to load:", item.image_url)
                    const target = e.target as HTMLImageElement
                    target.src = "/placeholder.svg?height=300&width=300"
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                  <div className="text-gray-400 text-center">
                    <Shirt className="h-12 w-12 mx-auto mb-3" />
                    <p className="text-sm font-medium">Нет изображения</p>
                  </div>
                </div>
              )}
            </div>

            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-3 text-gray-900 line-clamp-2">
                {item.item_name || "Без названия"}
              </h3>

              <div className="flex flex-wrap gap-2 mb-4">
                {item.basic_item_id && (
                  <Badge variant="default" className="text-xs px-2 py-1 rounded-full bg-gray-800 text-white">
                    Базовая вещь
                  </Badge>
                )}
                {item.material && (
                  <Badge variant="secondary" className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    {item.material}
                  </Badge>
                )}
                {item.shade && (
                  <Badge variant="outline" className="text-xs px-2 py-1 rounded-full border-gray-300 text-gray-600">
                    {item.shade}
                  </Badge>
                )}
                {item.style && (
                  <Badge variant="outline" className="text-xs px-2 py-1 rounded-full border-gray-300 text-gray-600">
                    {item.style}
                  </Badge>
                )}
                {item.has_print && item.has_print !== "нет" && (
                  <Badge variant="outline" className="text-xs px-2 py-1 rounded-full border-gray-300 text-gray-600">
                    {item.has_print}
                  </Badge>
                )}
              </div>

              <div className="flex items-center text-xs text-gray-500">
                <Calendar className="h-3 w-3 mr-2" />
                Добавлено: {new Date(item.created_at).toLocaleDateString("ru-RU")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
