"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { WardrobeItemCard } from "@/components/wardrobe-item-card"
import { WardrobeFilters } from "@/components/wardrobe-filters"
import { Button } from "@/components/ui/button"
import { Loader2, Shirt, Plus, Settings, EyeOff, Eye, X, Upload } from "lucide-react"
import type { WardrobeItem } from "@/lib/wardrobe"
import { SelectedItemsBar } from "@/components/selected-items-bar"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

export default function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const {
    selectedItems,
    setItems: setSelectedItems,
    setEditingOutfitId,
    addItem,
    removeItem,
    isSelected,
    clearItems,
  } = useSelectedItems()
  const [editingOutfit, setEditingOutfit] = useState<any>(null)
  const { toast } = useToast()
  const [isCreatingOutfit, setIsCreatingOutfit] = useState(false)
  const router = useRouter()
const searchParams = useSearchParams()

  // Проверяем URL параметры для редактирования
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const editId = urlParams.get("edit")

    if (editId) {
      loadOutfitForEditing(Number(editId))
    }
  }, [])


  const loadOutfitForEditing = async (outfitId: number) => {
    try {
      const response = await fetch(`/api/outfits/${outfitId}`)
      if (!response.ok) {
        throw new Error("Failed to load outfit")
      }

      const data = await response.json()
      const outfit = data.outfit

      // Загружаем элементы образа в контекст
      const outfitItems = outfit.outfit_items
        .sort((a: any, b: any) => a.position - b.position)
        .map((item: any) => ({
          ...item.wardrobe_items,
          image_url: item.wardrobe_items.image_url,
          type: "user",
        }))

      setSelectedItems(outfitItems)
      setEditingOutfitId(outfitId)
      setEditingOutfit(outfit)

      setIsCreatingOutfit(true)

      toast({
        title: "Режим редактирования",
        description: `Загружен образ "${outfit.name}" для редактирования`,
      })
    } catch (error) {
      console.error("Error loading outfit for editing:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить образ для редактирования",
        variant: "destructive",
      })
    }
  }

  const fetchItems = useCallback(async (filters: { search: string; types: string[] }) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (filters.search) params.append("search", filters.search)
      if (filters.types.length > 0) params.append("types", filters.types.join(","))

      const response = await fetch(`/api/wardrobe?${params.toString()}`)

      if (!response.ok) {
        throw new Error("Failed to fetch wardrobe items")
      }

      const data = await response.json()
      setItems(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching wardrobe items:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems({ search: "", types: [] })
  }, [fetchItems])

  const handleFilterChange = useCallback(
    (filters: { search: string; types: string[] }) => {
      setSelectedTypes(filters.types)
      fetchItems(filters)
    },
    [fetchItems],
  )

  const handleRetry = () => {
    fetchItems({ search: "", types: selectedTypes })
  }

  const handleHideAll = async () => {
    setIsUpdatingAll(true)

    try {
      const response = await fetch("/api/wardrobe/visibility", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hideAll: true }),
      })

      if (!response.ok) {
        throw new Error("Failed to hide all items")
      }

      toast({
        title: "Все вещи скрыты",
        description: "Все элементы гардероба скрыты из публичного просмотра",
      })

      // Обновляем локальное состояние
      setItems((prevItems) => prevItems.map((item) => ({ ...item, is_hidden: true })))
    } catch (error) {
      console.error("Error hiding all items:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось скрыть все вещи",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingAll(false)
    }
  }

  const handleShowAll = async () => {
    setIsUpdatingAll(true)

    try {
      const response = await fetch("/api/wardrobe/visibility", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hideAll: false }),
      })

      if (!response.ok) {
        throw new Error("Failed to show all items")
      }

      toast({
        title: "Все вещи показаны",
        description: "Все элементы гардероба теперь видны",
      })

      // Обновляем локальное состояние
      setItems((prevItems) => prevItems.map((item) => ({ ...item, is_hidden: false })))
    } catch (error) {
      console.error("Error showing all items:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось показать все вещи",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingAll(false)
    }
  }

  const handleVisibilityChange = (itemId: number, isHidden: boolean) => {
    // Обновляем локальное состояние для конкретной вещи
    setItems((prevItems) => prevItems.map((item) => (item.id === itemId ? { ...item, is_hidden: isHidden } : item)))
  }

  const handleDelete = (itemId: number) => {
    console.log("handleDelete called with itemId:", itemId)
    // Удаляем элемент из локального состояния
    setItems((prevItems) => {
      const newItems = prevItems.filter((item) => item.id !== itemId)
      console.log("Items before filter:", prevItems.length)
      console.log("Items after filter:", newItems.length)
      return newItems
    })
  }

  const handleRefresh = () => {
    fetchItems({ search: "", types: selectedTypes })
  }

  const handleItemSelect = (item: WardrobeItem) => {
    const itemWithType = { ...item, type: "user" as const }
    if (isSelected("user", item.id)) {
      removeItem("user", item.id)
    } else {
      addItem(itemWithType)
    }
  }

  const handleCreateOutfitToggle = () => {
  if (isCreatingOutfit) {
    clearItems()
    setEditingOutfit(null)
    setEditingOutfitId(null)
  }
  setIsCreatingOutfit(!isCreatingOutfit)

  // Удаляем edit/editId из query-параметров
  const params = new URLSearchParams(searchParams.toString())
  params.delete("edit")

  router.replace(
    window.location.pathname + (params.toString() ? "?" + params.toString() : ""),
    { scroll: false }
  )
}

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Ошибка загрузки данных</div>
          <p className="text-gray-600">{error}</p>
          <Button onClick={handleRetry}>Попробовать снова</Button>
        </div>
      </div>
    )
  }

  const hiddenCount = items.filter((item) => item.is_hidden).length
  const visibleCount = items.length - hiddenCount

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Заголовок */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <Shirt className="h-8 w-8 text-gray-700" />
                <h1 className="text-3xl font-bold text-gray-900">Мой гардероб</h1>
              </div>

              {/* Адаптивные кнопки */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={handleShowAll}
                    disabled={isUpdatingAll || hiddenCount === 0}
                    className="flex items-center justify-center gap-2 bg-transparent min-w-0"
                  >
                    {isUpdatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    <span className="whitespace-nowrap">Показать все</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleHideAll}
                    disabled={isUpdatingAll || visibleCount === 0}
                    className="flex items-center justify-center gap-2 bg-transparent min-w-0"
                  >
                    {isUpdatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
                    <span className="whitespace-nowrap">Скрыть все</span>
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Link href="/admin/wardrobe/basics" className="flex-1">
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 bg-transparent w-full min-w-0"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="whitespace-nowrap">Базовые элементы</span>
                    </Button>
                  </Link>
                  <Link href="/admin/wardrobe/add" className="flex-1">
                    <Button className="flex items-center justify-center gap-2 w-full min-w-0">
                      <Plus className="h-4 w-4" />
                      <span className="whitespace-nowrap">Добавить вещь</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600">
              <p className="flex-1">
                Коллекция одежды с фотографиями и подробной информацией.
                <span className="font-medium ml-1">
                  {isCreatingOutfit
                    ? "Нажмите на карточки, чтобы выбрать вещи для образа."
                    : "Нажмите на карточку, чтобы посмотреть детали."}
                </span>
              </p>
              {hiddenCount > 0 && (
                <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap">
                  {hiddenCount} скрыто
                </div>
              )}
            </div>
          </div>

          {/* Фильтры */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <WardrobeFilters onFilterChange={handleFilterChange} selectedTypes={selectedTypes} />
          </div>

          {/* Результаты */}
          <div className="bg-white rounded-lg shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Загрузка...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <Shirt className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ничего не найдено</h3>
                <p className="text-gray-600">Попробуйте изменить параметры поиска или фильтры</p>
                <Link href="/admin/wardrobe/add" className="mt-4 inline-block">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить первую вещь
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Sticky заголовок с кнопками */}
                <div className="sticky top-16 z-40 bg-white border-b border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Найдено: {items.length} {items.length === 1 ? "вещь" : items.length < 5 ? "вещи" : "вещей"}
                      {selectedTypes.length > 0 && (
                        <span className="text-sm text-gray-500 ml-2">
                          (фильтр: {selectedTypes.length}{" "}
                          {selectedTypes.length === 1 ? "тип" : selectedTypes.length < 5 ? "типа" : "типов"})
                        </span>
                      )}
                    </h2>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex items-center gap-2 bg-white border-gray-300 hover:bg-gray-50"
                      >
                        <Upload className="h-4 w-4" />
                        Загрузить фото
                      </Button>
                      <Button
                        onClick={handleCreateOutfitToggle}
                        variant={isCreatingOutfit ? "destructive" : "default"}
                        className="flex items-center gap-2 shadow-sm"
                      >
                        {isCreatingOutfit ? (
                          <>
                            <X className="h-4 w-4" />
                            Отменить
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Создать образ
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Индикатор режима создания образа */}
                  {isCreatingOutfit && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-800">
                          <Plus className="h-5 w-5" />
                          <span className="font-medium">Режим создания образа</span>
                        </div>
                        <Button
                          onClick={handleCreateOutfitToggle}
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-blue-600 mt-1">
                        Выберите вещи для создания образа. Выбрано: {selectedItems.length}
                      </p>
                    </div>
                  )}
                </div>

                {/* Сетка вещей */}
                <div className="p-6 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {items.map((item) => (
                      <WardrobeItemCard
                        key={item.id}
                        item={item}
                        isAdmin={!isCreatingOutfit}
                        onVisibilityChange={handleVisibilityChange}
                        onDelete={handleDelete}
                        isSelected={isCreatingOutfit && isSelected("user", item.id)}
                        onSelect={isCreatingOutfit ? handleItemSelect : undefined}
                        onRefresh={handleRefresh}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Панель выбранных элементов */}
      {isCreatingOutfit && <SelectedItemsBar />}
    </div>
  )
}
