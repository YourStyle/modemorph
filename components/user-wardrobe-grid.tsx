"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, Loader2 } from "lucide-react"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"

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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Загружаем ваш гардероб...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
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
        <p className="text-gray-600 mb-4">Ваш гардероб пуст</p>
        <p className="text-sm text-gray-500">Добавьте первую вещь, загрузив фото одежды</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Мой гардероб</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{items.length} вещей</span>
          <Button onClick={fetchItems} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <div className="aspect-square relative bg-gray-100">
              {item.image_url ? (
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.item_name || "Вещь"}
                  fill
                  className="object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src = "/placeholder.svg?height=300&width=300"
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-gray-400 text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">👕</span>
                    </div>
                    <p className="text-sm">Нет изображения</p>
                  </div>
                </div>
              )}
            </div>

            <CardContent className="p-4">
              <h3 className="font-semibold text-lg mb-2">{item.item_name || "Без названия"}</h3>

              <div className="flex flex-wrap gap-1 mb-3">
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
                {item.has_print && item.has_print !== "нет" && (
                  <Badge variant="outline" className="text-xs">
                    {item.has_print}
                  </Badge>
                )}
              </div>

              <div className="text-xs text-gray-500">
                Добавлено: {new Date(item.created_at).toLocaleDateString("ru-RU")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
