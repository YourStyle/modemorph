"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import { CategoryProgressSheet } from "@/components/category-progress-sheet"
import { Plus, ChevronDown, ChevronUp, Search, Sparkles } from "lucide-react"
import { useAddToCloset } from "@/contexts/add-to-closet-context"
import { useAIAnalysis } from "@/contexts/ai-analysis-context"

import { Input } from "@/components/ui/input"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { SubscriptionSheet } from "@/components/subscription-sheet"

import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-feature"
import { normalizeImageFile } from "@/lib/image-normalize"
import { api } from "@/lib/api-client"

import { STYLE_LABELS } from "@/lib/labels"
import { StyleProfileCard } from "@/components/style-profile-card"
import { StyleCheckSheet } from "@/components/style-check-sheet"

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
  gender?: string
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
const SelectedPhotosPreview = ({ photos, onRemove }: { photos: UploadedPhoto[]; onRemove: (id: string) => void }) => {
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
  const [paywallOpen, setPaywallOpen] = useState(false)
  const { toast } = useToast()
  const { openSheet, setOnAnalysisSuccess } = useAddToCloset()
  const aiAnalysis = useAIAnalysis()

  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest")
  const [searchQuery, setSearchQuery] = useState("")
  const [dominantStyle, setDominantStyle] = useState<string | null>(null)
  const [styleTags, setStyleTags] = useState<string[]>([])
  const [styleCheckOpen, setStyleCheckOpen] = useState(false)

  useReconcileLimits(true)

  const { log, consume } = useFeature()

  const [userGender, setUserGender] = useState("")

  // Обработчик успешного анализа
  const handleAnalysisSuccess = useCallback(async (payload: any) => {
    console.log("[WardrobePage] handleAnalysisSuccess called with payload:", payload)

    if (!payload) {
      console.warn("[WardrobePage] handleAnalysisSuccess called with null/undefined payload")
      return
    }

    const { photos, analysisResults, batchId } = payload

    if (!photos || !analysisResults || !batchId) {
      console.warn("[WardrobePage] Missing required fields in payload:", { photos, analysisResults, batchId })
      return
    }

    // Очищаем selectedPhotos СРАЗУ после успешного анализа
    selectedPhotos.forEach((photo) => {
      if (typeof window !== "undefined") {
        URL.revokeObjectURL(photo.preview)
      }
    })
    setSelectedPhotos([])

    // Обновляем данные пользователя
    fetchUserItems()
    setRefreshUserItems((prev) => prev + 1)

    // считаем, сколько фото проанализировано успешно (есть items)
    const succeeded = analysisResults.filter((r: any) => r.success && r.items && r.items.length > 0).length
    if (succeeded <= 0) return

    // спишем по 1 за каждое удачное фото (наш API сейчас списывает по 1 за вызов)
    const res = await consume(
      "wardrobe_items_anlyzed",
      {
        pagePath: "/app/wardrobe",
        requestId: batchId,
        photosCount: photos.length,
        succeeded,
      },
      photos.length,
    )
    if (!res.ok && res.code === "payment_required") {
      setPaywallOpen(true)
    }
  }, [consume, selectedPhotos, setRefreshUserItems])

  // Регистрируем обработчик анализа в контексте
  useEffect(() => {
    console.log("[WardrobePage] Registering analysis success handler")
    setOnAnalysisSuccess(handleAnalysisSuccess)
    return () => {
      console.log("[WardrobePage] Unregistering analysis success handler")
      setOnAnalysisSuccess(null)
    }
  }, [setOnAnalysisSuccess, handleAnalysisSuccess])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await api.get("/api/me/profile")
        setUserGender(data?.profile?.gender || "")
        if (data?.profile?.dominant_style) setDominantStyle(data.profile.dominant_style)
        if (data?.profile?.style_tags) setStyleTags(data.profile.style_tags.split(",").filter(Boolean))
      } catch (err) {
        console.error(err)
      }
    }
    loadProfile()
  }, [])

  useEffect(() => {
    fetchUserItems()
  }, [sortBy, searchQuery, refreshUserItems])

  useEffect(() => {
    if (!userGender) return
    fetchBasicItems()
  }, [sortBy, searchQuery, userGender])

  // Listen for wardrobe item additions from background widget
  useEffect(() => {
    const handleWardrobeItemAdded = () => {
      console.log("[WardrobePage] Wardrobe item added, refreshing items")
      setRefreshUserItems((prev) => prev + 1)
    }

    window.addEventListener("wardrobe-item-added", handleWardrobeItemAdded)
    return () => {
      window.removeEventListener("wardrobe-item-added", handleWardrobeItemAdded)
    }
  }, [])

  const fetchBasicItems = async () => {
    try {
      setIsLoadingBasicItems(true)
      const data = await api.get(`/api/basic-wardrobe-items?gender=${userGender}`)
      console.log("Loaded basic items:", data)
      // Ensure data is an array
      const itemsArray = Array.isArray(data) ? data : []
      setBasicItems(itemsArray)
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

      const data = await api.get(`/api/wardrobe-user-items?${params.toString()}`)
      setUserItemsCount(Array.isArray(data) ? data.length : 0)
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
    void log("wardrobe_items_anlyzed", "click", { pagePath: "/app/wardrobe" })
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Проверяем есть ли активный анализ
    const activeSession = aiAnalysis.getActiveSession()
    if (activeSession) {
      toast.error("Дождитесь завершения текущего анализа")
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      return
    }

    const prepared = await Promise.all(
      files.map(async (file) => {
        let normalizedFile = file
        if (typeof window !== "undefined") {
          try {
            normalizedFile = await normalizeImageFile(file, {
              maxWidth: 1024,
              output: "image/jpeg",
              quality: 0.9,
            })
          } catch (error) {
            console.error("Error normalizing image:", error)
            // Fall back to original file if normalization fails
            normalizedFile = file
          }
        }

        return {
          file: normalizedFile,
          preview: typeof window !== "undefined" ? URL.createObjectURL(normalizedFile) : "",
          id: Math.random().toString(36).substr(2, 9),
        } as UploadedPhoto
      }),
    )

    setSelectedPhotos(prepared)
    console.log("[WardrobePage] Opening sheet with photos:", prepared)
    openSheet(prepared)

    // Очищаем input для возможности повторного выбора тех же файлов
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
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

      const result = await api.post("/api/wardrobe-user-items", payload)
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
    setSelectedPhotos((prev) => {
      const photoToRemove = prev.find((p) => p.id === photoId)
      if (photoToRemove && typeof window !== "undefined") {
        URL.revokeObjectURL(photoToRemove.preview)
      }
      return prev.filter((p) => p.id !== photoId)
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

        {/* Style profile + Add button */}
        <StyleProfileCard
          dominantStyle={dominantStyle}
          styleTags={styleTags}
          userItemsCount={userItemsCount}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/heic,image/heif,image/heic-sequence,image/jpeg,image/jpg,image/webp,image/png"
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        <div className="flex gap-3 mb-6">
          <Button
            onClick={handleAddToWardrobe}
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-2xl font-medium"
          >
            + Добавить
          </Button>
          <Button
            onClick={() => setStyleCheckOpen(true)}
            variant="outline"
            className="h-12 rounded-2xl px-4 border-gray-200"
            style={{ background: "linear-gradient(to right, rgba(236,157,226,0.08), rgba(137,174,255,0.08))" }}
          >
            <Sparkles className="h-4 w-4 mr-1.5" style={{ color: "#A78BFA" }} />
            <span className="text-sm">Подойдёт?</span>
          </Button>
        </div>

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
          {isLoadingUserItems ? (
            <UserWardrobeSkeleton />
          ) : (
            <UserWardrobeGrid
              onItemsChange={setUserItemsCount}
              refreshTrigger={refreshUserItems}
              searchQuery={searchQuery}
              sortBy={sortBy}
              onAddFirstItem={handleAddToWardrobe}
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

              {/* Кнопка показать/с��рыть все под сеткой */}
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

      <CategoryProgressSheet isOpen={isCategorySheetOpen} onClose={() => setIsCategorySheetOpen(false)} />

      <SubscriptionSheet
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => setPaywallOpen(false)}
      />

      <StyleCheckSheet
        isOpen={styleCheckOpen}
        onClose={() => setStyleCheckOpen(false)}
      />
    </div>
  )
}
