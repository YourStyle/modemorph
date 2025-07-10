"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Plus, BarChart3 } from "lucide-react"
import Image from "next/image"
import { PastelLoader } from "@/components/pastel-loader"
import { CategoryProgressSheet } from "@/components/category-progress-sheet"
import { AddBaseItemSheet } from "@/components/add-base-item-sheet"

interface WardrobeItem {
  id: number
  item_name: string
  image_url: string
  material: string
  color: string
  style: string
  has_print: string
  shade: string
  has_details: string
  size?: string
  notes?: string
  basic_item_id?: number
}

interface BasicItem {
  id: number
  item_name: string
  image_url: string
  material: string
  style: string
  color: string
  shade: string
  has_print: string
  has_details: string
}

interface CategoryProgress {
  category: string
  current: number
  total: number
  percentage: number
}

export default function WardrobePage() {
  const [userItems, setUserItems] = useState<WardrobeItem[]>([])
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBasicItem, setSelectedBasicItem] = useState<BasicItem | null>(null)
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Загружаем пользовательские вещи
      const userItemsResponse = await fetch("/api/wardrobe-user-items")
      if (userItemsResponse.ok) {
        const userData = await userItemsResponse.json()
        setUserItems(userData)
      }

      // Загружаем базовые вещи
      const basicItemsResponse = await fetch("/api/basic-wardrobe-items")
      if (basicItemsResponse.ok) {
        const basicData = await basicItemsResponse.json()
        setBasicItems(basicData)
      }

      // Загружаем прогресс по категориям
      const progressResponse = await fetch("/api/wardrobe/progress")
      if (progressResponse.ok) {
        const progressData = await progressResponse.json()
        setCategoryProgress(progressData)
      }
    } catch (error) {
      console.error("Error loading wardrobe data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddBasicItem = (item: BasicItem) => {
    setSelectedBasicItem(item)
    setIsAddSheetOpen(true)
  }

  const handleAddSuccess = () => {
    loadData() // Перезагружаем данные после успешного добавления
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PastelLoader />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-4">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Мой гардероб</h1>
            <p className="text-gray-600 text-sm">
              {userItems.length} {userItems.length === 1 ? "вещь" : userItems.length < 5 ? "вещи" : "вещей"} в коллекции
            </p>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Прогресс
              </Button>
            </SheetTrigger>
            <SheetContent>
              <CategoryProgressSheet categories={categoryProgress} />
            </SheetContent>
          </Sheet>
        </div>

        {/* Прогресс базового гардероба */}
        {categoryProgress.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Прогресс базового гардероба</h3>
                <span className="text-xs text-gray-500">
                  {Math.round(categoryProgress.reduce((acc, cat) => acc + cat.percentage, 0) / categoryProgress.length)}
                  %
                </span>
              </div>
              <Progress
                value={categoryProgress.reduce((acc, cat) => acc + cat.percentage, 0) / categoryProgress.length}
                className="h-2"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {categoryProgress.slice(0, 3).map((category) => (
                  <div key={category.category} className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <span className="text-xs text-gray-600">
                      {category.category}: {category.current}/{category.total}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Мои вещи */}
        {userItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Мои вещи</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {userItems.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden relative">
                      <Image
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.item_name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{item.item_name}</h4>
                      <div className="flex flex-wrap gap-1">
                        {item.size && (
                          <Badge variant="default" className="text-xs px-1 py-0">
                            {item.size}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {item.material}
                        </Badge>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {item.color}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Базовые вещи для добавления */}
        {basicItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Рекомендуемые базовые вещи</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {basicItems.map((item) => (
                <Card
                  key={item.id}
                  className="overflow-hidden relative group cursor-pointer transition-all duration-200 hover:shadow-md"
                >
                  <CardContent className="p-3">
                    <div className="aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden relative">
                      <Image
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.item_name}
                        fill
                        className="object-cover transition-all duration-200 group-hover:opacity-60"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                      {/* Кнопка добавления при наведении */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Button onClick={() => handleAddBasicItem(item)} size="sm" className="shadow-lg">
                          <Plus className="h-4 w-4 mr-1" />
                          Добавить
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm line-clamp-2 min-h-[2.5rem] group-hover:text-gray-600 transition-colors">
                        {item.item_name}
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {item.material}
                        </Badge>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {item.color}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sheet для добавления базовой вещи */}
      <AddBaseItemSheet
        isOpen={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
        item={selectedBasicItem}
        onSuccess={handleAddSuccess}
      />
    </div>
  )
}
