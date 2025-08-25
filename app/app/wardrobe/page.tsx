"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { CategoryProgressSheet } from "@/components/category-progress-sheet"
import { Progress } from "@/components/ui/progress"
import { Plus, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"

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
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string
  has_details?: string
}

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

// Skeleton component for user wardrobe items
const UserWardrobeSkeleton = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <Card key={i} className="bg-white border-0 shadow-sm overflow-hidden">
          <div className="aspect-square bg-gray-200 animate-pulse"></div>
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            <div className="h-2 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            <div className="h-2 bg-gray-200 rounded w-1/3 animate-pulse"></div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// Skeleton component for basic wardrobe items
const BasicItemsSkeleton = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <Card key={i} className="bg-white border-0 shadow-sm overflow-hidden">
          <div className="aspect-square bg-gray-200 animate-pulse"></div>
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-4/5 animate-pulse"></div>
            <div className="h-2 bg-gray-200 rounded w-3/5 animate-pulse"></div>
            <div className="h-2 bg-gray-200 rounded w-2/5 animate-pulse"></div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// Компонент для превью выбранных фото
const SelectedPhotosPreview = ({ photos, onRemove }: { photos: UploadedPhoto[], onRemove: (id: string) => void }) => {
  if (photos.length === 0) return null
  
  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Выбранные фото ({photos.length})</h3>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative flex-shrink-0">
            <img
              src={photo.preview || "/placeholder.svg"}
              alt="Preview"
              className="w-16 h-16 object-cover rounded-lg border"
            />
            <button
              onClick={() => onRemove(photo.id)}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function WardrobePage() {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicWardrobeItem[]>([])
  const [isLoadingBasicItems, setIsLoadingBasicItems] = useState(true)
  const [showAllBasicItems, setShowAllBasicItems] = useState(false)
  const [userItemsCount, setUserItemsCount] = useState(0)
  const [addingItemId, setAddingItemId] = useState<number | null>(null)
  const [refreshUserItems, setRefreshUserItems] = useState(0)
  const [selectedPhotos, setSelectedPhotos] = useState<UploadedPhoto[]>([])
  const [isLoadingUserItems, setIsLoadingUserItems] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchBasicItems()
    fetchUserItems()
  }, [sortBy, searchQuery])

  const fetchBasicItems = async () => {
    try {
      setIsLoadingBasicItems(true)
      const response = await fetch("/api/basic-wardrobe-items")
      if (response.ok) {
        const data = await response.json()
        console.log("Loaded basic items:", data)
        // Ensure data is an array
        const itemsArray = Array.isArray(data) ? data : []
        setBasicItems(itemsArray)
      } else {
        console.error("Failed to fetch basic items:", response.statusText)
        setBasicItems([])
      }
    } catch (error) {
      console.error("Error fetching basic items:", error)
      setBasicItems([])
    } finally {
      setIsLoadingBasicItems(false)
    }
  }

  const fetchUserItems = async () => {
    try {
      setIsLoadingUserItems(true)

      // Строим URL с параметрами
      const params = new URLSearchParams()
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim())
      }
      params.append("sort", sortBy)

      const response = await fetch(`/api/wardrobe-user-items?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setUserItemsCount(Array.isArray(data) ? data.length : 0)
      }
    } catch (error) {
      console.error("Error fetching user items:", error)
    } finally {
      setIsLoadingUserItems(false)
    }
  }

  const handleCategoryClick = () => {
    setIsCategorySheetOpen(true)
  }

  const handleAddToWardrobe = () => {
    // Сразу открываем диалог выбора файлов
    fileInputRef.current?.click()
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const newPhotos: UploadedPhoto[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
    }))

    setSelectedPhotos(newPhotos)
    setIsAddSheetOpen(true)

    // Очищаем input для возможности повторного выбора тех же файлов
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSheetClose = () => {
    // Освобождаем URL объекты при закрытии
    selectedPhotos.forEach((photo) => {
      URL.revokeObjectURL(photo.preview)
    })
    setSelectedPhotos([])
    setIsAddSheetOpen(false)

    // Обновляем данные пользователя после закрытия шторки
    fetchUserItems()
    setRefreshUserItems((prev) => prev + 1)
  }

  const handleAddBaseItem = async (item: BasicWardrobeItem) => {
    try {
      setAddingItemId(item.id)
      console.log("Adding base item:", item)

      const payload = {
        item_name: item.item_name, // Убедимся что передается правильное название
        basic_item_id: item.id,
        material: item.material || "",
        style: item.style || "",
        color: item.color || "",
        shade: item.shade || "",
        has_print: item.has_print || "нет",
        has_details: item.has_details || "нет",
        size_type: "M", // Размер по умолчанию
        notes: "",
        image_url: item.image_url,
      }

      console.log("Sending payload:", payload)

      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to add item")
      }

      const result = await response.json()
      console.log("Item added successfully:", result)

      toast({
        title: "Вещь добавлена",
        description: `${item.item_name} добавлена в ваш гардероб`,
      })

      // Обновляем список базовых вещей (чтобы скрыть добавленную)
      fetchBasicItems()
      // Обновляем количество пользовательских вещей
      fetchUserItems()
      // Принудительно обновляем UserWardrobeGrid
      setRefreshUserItems((prev) => prev + 1)
    } catch (error) {
      console.error("Error adding base item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось добавить вещь в гардероб",
        variant: "destructive",
      })
    } finally {
      setAddingItemId(null)
    }
  }

  const displayedBasicItems = showAllBasicItems ? basicItems : basicItems.slice(0, 12)
  const targetItemsCount = 30
  const progressPercentage = (userItemsCount / targetItemsCount) * 100

  const handleRemovePhoto = (photoId: string) => {
    setSelectedPhotos(prev => {
      const photoToRemove = prev.find(p => p.id === photoId)
      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.preview)
      }
      return prev.filter(p => p.id !== photoId)
    })
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
              <span className="text-sm text-gray-500">
                {userItemsCount}/{targetItemsCount} вещей
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2 mb-3" />
            <p className="text-sm text-gray-600">
              {userItemsCount >= targetItemsCount
                ? "Поздравляем! Вы достигли цели базового гардероба"
                : `Добавьте еще ${targetItemsCount - userItemsCount} ${targetItemsCount - userItemsCount === 1 ? "вещь" : targetItemsCount - userItemsCount < 5 ? "вещи" : "вещей"} для достижения цели`}
            </p>
          </div>

          {/* Category Icons */}


          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />

          <Button
            onClick={handleAddToWardrobe}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-2xl font-medium"
          >
            + Добавить в гардероб
          </Button>
        </Card>

        {/* Фильтры и поиск */}
        <div className="space-y-4 mb-6">
          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Поиск по названию вещи..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200"
            />
          </div>

          {/* Сортировка */}
          <Select value={sortBy} onValueChange={(value: "newest" | "oldest" | "name") => setSortBy(value)}>
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
          <SelectedPhotosPreview photos={selectedPhotos} onRemove={handleRemovePhoto} />
          {isLoadingUserItems ? (
            <UserWardrobeSkeleton />
          ) : (
            <UserWardrobeGrid
              onItemsChange={setUserItemsCount}
              refreshTrigger={refreshUserItems}
              searchQuery={searchQuery}
              sortBy={sortBy}
            />
          )}
        </div>

        {/* Basic Items */}
        <div>
          <h2 className="text-lg font-serif font-semibold text-gray-900 mb-4">Рекомендуемые базовые вещи</h2>

          {isLoadingBasicItems ? (
            <BasicItemsSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                        <span className="text-2xl">👕</span>
                      )}

                      {/* Кнопка добавления - всегда видна на мобильных и планшетах, при наведении на десктопе */}
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button
                          onClick={() => handleAddBaseItem(item)}
                          size="sm"
                          disabled={addingItemId === item.id}
                          className="bg-white text-gray-900 hover:bg-gray-100 shadow-lg text-xs px-2 py-1 h-7"
                        >
                          {addingItemId === item.id ? (
                            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin mr-1" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          {addingItemId === item.id ? "..." : "Добавить"}
                        </Button>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-gray-900 text-xs mb-1 line-clamp-2 leading-tight">
                        {item.item_name}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-tight">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded text-center">
                          {item.clothing_type}
                        </span>
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

              {/* Кнопка показать/скрыть все под сеткой */}
              {basicItems.length > 12 && (
                <div className="flex justify-center mt-6">
                  <Button
                    variant="outline"
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
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddToClosetSheet isOpen={isAddSheetOpen} onClose={handleSheetClose} initialPhotos={selectedPhotos || []} />

      <CategoryProgressSheet isOpen={isCategorySheetOpen} onClose={() => setIsCategorySheetOpen(false)} />
    </div>
  )
}
