"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { CategoryProgressSheet } from "@/components/category-progress-sheet"
import { PastelLoader } from "@/components/pastel-loader"
import { Progress } from "@/components/ui/progress"

const clothingCategories = [
  { id: "outerwear", name: "Верхняя одежда", icon: "🧥", emoji: "🧥" },
  { id: "pants", name: "Брюки", icon: "👖", emoji: "👖" },
  { id: "shoes", name: "Обувь", icon: "👠", emoji: "👠" },
  { id: "dresses", name: "Платья", icon: "👗", emoji: "👗" },
]

interface BasicWardrobeItem {
  id: number
  item_name: string
  clothing_type: string
  image_url?: string
  colors?: string[]
}

export default function WardrobePage() {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicWardrobeItem[]>([])
  const [isLoadingBasicItems, setIsLoadingBasicItems] = useState(true)

  useEffect(() => {
    fetchBasicItems()
  }, [])

  const fetchBasicItems = async () => {
    try {
      const response = await fetch("/api/basic-wardrobe-items")
      if (response.ok) {
        const data = await response.json()
        setBasicItems(data.items || [])
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
          <h2 className="text-lg font-serif font-semibold text-gray-900 mb-4">Рекомендуемые базовые вещи</h2>
          {isLoadingBasicItems ? (
            <div className="flex justify-center py-8">
              <PastelLoader size={40} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {basicItems.slice(0, 6).map((item) => (
                <Card key={item.id} className="bg-white border-0 shadow-sm overflow-hidden">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    {item.image_url ? (
                      <img
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.item_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl">👕</span>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 text-sm mb-1 line-clamp-2">{item.item_name}</h3>
                    <p className="text-xs text-gray-500">{item.clothing_type}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddToClosetSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />

      <CategoryProgressSheet isOpen={isCategorySheetOpen} onClose={() => setIsCategorySheetOpen(false)} />
    </div>
  )
}
