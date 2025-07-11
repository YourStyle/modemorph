"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { CategoryProgressSheet } from "@/components/category-progress-sheet"
import { AddBaseItemSheet } from "@/components/add-base-item-sheet"
import { PastelLoader } from "@/components/pastel-loader"
import { Progress } from "@/components/ui/progress"
import { Plus, ChevronDown, ChevronUp } from "lucide-react"

const clothingCategories = [
  { id: "outerwear", name: "Верхняя одежда", icon: "🧥", emoji: "🧥" },
  { id: "pants", name: "Брюки", icon: "👖", emoji: "👖" },
  { id: "shoes", name: "Обувь", icon: "👠", emoji: "👠" },
  { id: "dresses", name: "Платья", icon: "👗", emoji: "👗" },
]

interface BasicWardrobeItem {
  id: number
  item_name: string
  description?: string
  clothing_type: string
  image_url?: string
  colors?: string[]
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string
  has_details?: string
}

export default function WardrobePage() {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
  const [isAddBaseItemSheetOpen, setIsAddBaseItemSheetOpen] = useState(false)
  const [selectedBaseItem, setSelectedBaseItem] = useState<BasicWardrobeItem | null>(null)
  const [basicItems, setBasicItems] = useState<BasicWardrobeItem[]>([])
  const [isLoadingBasicItems, setIsLoadingBasicItems] = useState(true)
  const [showAllBasicItems, setShowAllBasicItems] = useState(false)

  useEffect(() => {
    fetchBasicItems()
  }, [])

  const fetchBasicItems = async () => {
    try {
      setIsLoadingBasicItems(true)
      const response = await fetch("/api/basic-wardrobe-items")
      if (response.ok) {
        const data = await response.json()
        setBasicItems(data.items || [])
      } else {
        console.error("Failed to fetch basic items:", response.statusText)
      }
    } catch (error) {
      console.error("Error fetching basic items:", error)
    } finally {
      setIsLoadingBasicItems(false)
    }
  }

  const handleCategoryClick = () => {
    setIsCategorySheetOpen(true)
  }

  const handleAddBaseItem = (item: BasicWardrobeItem) => {
    setSelectedBaseItem(item)
    setIsAddBaseItemSheetOpen(true)
  }

  const handleBaseItemAdded = () => {
    // Обновляем список базовых вещей после добавления
    fetchBasicItems()
    setIsAddBaseItemSheetOpen(false)
    setSelectedBaseItem(null)
  }

  const displayedBasicItems = showAllBasicItems ? basicItems : basicItems.slice(0, 8)

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-serif font-bold text-gray-900 mb-2">Гардероб</h1>
          <p className="text-gray-600 text-sm">Управляйте своими вещами</p>
        </div>

        {/* Progress Section */}
        <Card className="p-6 mb-8 bg-white border-0 shadow-sm">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-serif font-semibold text-gray-900">Цель гардероба</h3>
              <span className="text-sm text-gray-500">2/30 вещей</span>
            </div>
            <Progress value={6.67} className="h-2 mb-3" />
            <p className="text-sm text-gray-600">Добавьте еще 28 вещей для достижения первой цели</p>
          </div>

          {/* Category Icons */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {clothingCategories.map((category) => (
              <button
                key={category.id}
                onClick={handleCategoryClick}
                className="flex flex-col items-center p-4 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 shadow-sm">
                  <span className="text-2xl">{category.emoji}</span>
                </div>
                <span className="text-xs text-gray-700 text-center font-medium">{category.name}</span>
              </button>
            ))}
          </div>

          <Button
            onClick={() => setIsAddSheetOpen(true)}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-2xl font-medium"
          >
            + Добавить в гардероб
          </Button>
        </Card>

        {/* Sorting */}
        <div className="flex items-center justify-between mb-6">
          <Select defaultValue="newest">
            <SelectTrigger className="w-48 bg-white border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Сначала новые</SelectItem>
              <SelectItem value="oldest">Сначала старые</SelectItem>
              <SelectItem value="name">По названию</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User's Wardrobe */}
        <div className="mb-8">
          <h2 className="text-lg font-serif font-semibold text-gray-900 mb-4">Ваши вещи</h2>
          <UserWardrobeGrid />
        </div>

        {/* Basic Items */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold text-gray-900">Рекомендуемые базовые вещи</h2>
            {basicItems.length > 8 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllBasicItems(!showAllBasicItems)}
                className="bg-transparent"
              >
                {showAllBasicItems ? (
                  <>
                    Скрыть <ChevronUp className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Показать все ({basicItems.length}) <ChevronDown className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>

          {isLoadingBasicItems ? (
            <div className="flex justify-center py-8">
              <PastelLoader size={40} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {displayedBasicItems.map((item) => (
                  <Card key={item.id} className="bg-white border-0 shadow-sm overflow-hidden relative group">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                      {item.image_url ? (
                        <img
                          src={item.image_url || "/placeholder.svg"}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl">👕</span>
                      )}

                      {/* Кнопка добавления всегда видна */}
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          onClick={() => handleAddBaseItem(item)}
                          size="sm"
                          className="bg-white text-gray-900 hover:bg-gray-100 shadow-lg"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Добавить
                        </Button>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">{item.item_name}</h3>
                      {item.description && (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">{item.clothing_type}</span>
                        {item.material && (
                          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">{item.material}</span>
                        )}
                        {item.color && (
                          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">{item.color}</span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {basicItems.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">Все базовые вещи уже добавлены в ваш гардероб!</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddToClosetSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />

      <CategoryProgressSheet isOpen={isCategorySheetOpen} onClose={() => setIsCategorySheetOpen(false)} />

      <AddBaseItemSheet
        isOpen={isAddBaseItemSheetOpen}
        onClose={() => setIsAddBaseItemSheetOpen(false)}
        item={selectedBaseItem}
        onSuccess={handleBaseItemAdded}
      />
    </div>
  )
}
