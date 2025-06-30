"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageIcon, Package } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface UserWardrobeItem {
  id: number
  item_name: string
  size_type: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  url: string
  image_url: string | null
  is_basic: boolean
  basic_item_id: number | null
  notes: string | null
  basic_material_id: number | null
  is_hidden: boolean
  created_at: string
  updated_at: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<UserWardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    try {
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const data = await response.json()
        setItems(data)
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить вещи",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Ваш гардероб пуст</h3>
        <p className="text-gray-600">Загрузите фото, чтобы добавить вещи в гардероб</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <Card key={item.id} className="group hover:shadow-lg transition-all duration-200">
          <CardContent className="p-4">
            {/* Изображение */}
            <div className="relative aspect-square mb-4 bg-gray-100 rounded-lg overflow-hidden">
              {item.image_url ? (
                <img
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.item_name}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <ImageIcon className="h-12 w-12" />
                </div>
              )}
            </div>

            {/* Информация о вещи */}
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-lg line-clamp-2 mb-1">
                  {item.item_name.replace(/_/g, " ").replace(/-/g, " ")}
                </h3>
                <p className="text-sm text-gray-600">Материал: {item.material}</p>
              </div>

              {/* Бейджи */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  {item.color}
                </Badge>
                {item.style && item.style !== "unknown" && (
                  <Badge variant="outline" className="text-xs">
                    {item.style}
                  </Badge>
                )}
                {item.has_print === "yes" && (
                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                    С принтом
                  </Badge>
                )}
              </div>

              {/* Дата добавления */}
              <div className="text-xs text-gray-500">
                Добавлено: {new Date(item.created_at).toLocaleDateString("ru-RU")}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
