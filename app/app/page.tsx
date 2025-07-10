"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { OutfitCard } from "@/components/outfit-card"
import { PastelLoader } from "@/components/pastel-loader"
import { Sparkles } from "lucide-react"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  category: string
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
  source?: string
}

interface LookSection {
  title: string
  looks_count: number
  suggestions: OutfitSuggestion[]
}

// Mock data for outfit suggestions
const mockOutfitSuggestions: LookSection[] = [
  {
    title: "Галерея Гала",
    looks_count: 3,
    suggestions: [
      {
        id: "1",
        title: "Элегантный вечер",
        items: [
          {
            id: "item1",
            name: "Черный топ на бретелях",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "tops",
          },
          {
            id: "item2",
            name: "Черная плиссированная юбка",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "bottoms",
          },
          {
            id: "item3",
            name: "Черные кожаные лоферы",
            image_url: "/placeholder.svg?height=150&width=200",
            category: "shoes",
          },
        ],
        suggested_items_count: 1,
      },
      {
        id: "2",
        title: "Изысканный шик",
        items: [
          {
            id: "item4",
            name: "Черная сумка через плечо",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "accessories",
          },
          {
            id: "item5",
            name: "Черные лоферы на платформе",
            image_url: "/placeholder.svg?height=150&width=200",
            category: "shoes",
          },
        ],
        suggested_items_count: 6,
        source: "Istrommedia.com",
      },
      {
        id: "3",
        title: "Классический стиль",
        items: [
          {
            id: "item15",
            name: "Белая блузка",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "tops",
          },
          {
            id: "item16",
            name: "Черные брюки",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "bottoms",
          },
        ],
        suggested_items_count: 2,
      },
    ],
  },
  {
    title: "Повседневные выходные",
    looks_count: 5,
    suggestions: [
      {
        id: "4",
        title: "Расслабленный комфорт",
        items: [
          {
            id: "item6",
            name: "Белая хлопковая футболка",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "tops",
          },
          {
            id: "item7",
            name: "Синие джинсы",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "bottoms",
          },
          {
            id: "item8",
            name: "Белые кроссовки",
            image_url: "/placeholder.svg?height=150&width=200",
            category: "shoes",
          },
        ],
        suggested_items_count: 2,
      },
      {
        id: "5",
        title: "Спортивный стиль",
        items: [
          {
            id: "item17",
            name: "Серая толстовка",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "tops",
          },
          {
            id: "item18",
            name: "Черные леггинсы",
            image_url: "/placeholder.svg?height=200&width=150",
            category: "bottoms",
          },
        ],
        suggested_items_count: 3,
      },
    ],
  },
]

export default function HomePage() {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [outfitSections, setOutfitSections] = useState<LookSection[]>([])
  const [loading, setLoading] = useState(true)

  // Load outfit suggestions
  useEffect(() => {
    const loadOutfitSuggestions = async () => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setOutfitSections(mockOutfitSuggestions)
      setLoading(false)
    }

    loadOutfitSuggestions()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-serif font-bold text-gray-900 mb-2">Добро пожаловать</h1>
          <p className="text-gray-600 text-sm">Создавайте стильные образы с помощью ИИ</p>
        </div>

        {/* 3D Wardrobe Visualization */}
        <div className="flex justify-center mb-12">
          <div className="relative">
            <div className="w-80 h-80 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl shadow-2xl flex items-center justify-center overflow-hidden">
              <div className="relative w-64 h-64">
                {/* Имитация 3D гардероба */}
                <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-gray-100 rounded-2xl shadow-inner">
                  <div className="absolute top-4 left-4 right-4 h-2 bg-gray-300 rounded-full"></div>

                  {/* Вешалки с одеждой */}
                  <div className="absolute top-8 left-6 right-6 flex justify-between">
                    <div className="w-8 h-24 bg-gradient-to-b from-green-200 to-green-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-20 bg-gradient-to-b from-blue-200 to-blue-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-28 bg-gradient-to-b from-yellow-200 to-yellow-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-22 bg-gradient-to-b from-pink-200 to-pink-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-26 bg-gradient-to-b from-purple-200 to-purple-300 rounded-lg shadow-sm"></div>
                  </div>

                  {/* Полки снизу */}
                  <div className="absolute bottom-8 left-6 right-6">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded shadow-sm flex items-center justify-center">
                        <div className="w-4 h-4 bg-blue-400 rounded"></div>
                      </div>
                      <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded shadow-sm flex items-center justify-center">
                        <div className="w-6 h-3 bg-white rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Секция добавления */}
        <Card className="p-6 mb-8 bg-white border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Button
              onClick={() => setIsAddSheetOpen(true)}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-2xl font-medium"
            >
              + Добавить в гардероб
            </Button>

            <div className="mt-6 text-center">
              <p className="text-gray-600 text-sm mb-2">Не знаете, с чего начать?</p>
              <Button variant="link" className="text-blue-400 hover:text-blue-300 p-0 h-auto font-medium">
                <Sparkles className="h-4 w-4 mr-1" />
                Получить стиль от ИИ
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Outfit Suggestions */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <PastelLoader />
          </div>
        ) : (
          <div className="space-y-8">
            {outfitSections.map((section, sectionIndex) => (
              <div key={`${section.title}-${sectionIndex}`} className="space-y-4">
                {/* Section Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
                  <span className="text-sm text-gray-500">{section.looks_count} образов</span>
                </div>

                {/* Horizontal Scrolling Container */}
                <div className="relative">
                  <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory">
                    {section.suggestions.map((suggestion) => (
                      <div key={suggestion.id} className="flex-shrink-0 w-80 snap-start">
                        <OutfitCard suggestion={suggestion} />
                      </div>
                    ))}
                  </div>

                  {/* Scroll indicators */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-gray-50 to-transparent pointer-events-none opacity-50" />
                  <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-gray-50 to-transparent pointer-events-none opacity-50" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddToClosetSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />
    </div>
  )
}
