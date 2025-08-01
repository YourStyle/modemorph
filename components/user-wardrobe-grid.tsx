"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Filter, Search, Grid, List, Eye, EyeOff } from "lucide-react"
import { WardrobeFilters } from "@/components/wardrobe-filters"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { ItemDetailsModal } from "@/components/item-details-modal"
import { EditWardrobeItemModal } from "@/components/edit-wardrobe-item-modal"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { OptimizedImage } from "@/components/optimized-image"

interface WardrobeItem {
  id: string
  name: string
  image_url: string
  color: string
  shade: string
  has_print: string
  notes?: string
  user_id: string
  created_at: string
  updated_at: string
  is_visible: boolean
  clothing_type?: {
    id: string
    name: string
    category: string
  }
}

interface UserWardrobeGridProps {
  searchQuery?: string
  selectedFilters?: {
    categories: string[]
    colors: string[]
    types: string[]
  }
}

export function UserWardrobeGrid({ searchQuery = "", selectedFilters }: UserWardrobeGridProps) {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null)
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery)
  const [showHidden, setShowHidden] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadWardrobeItems()
  }, [])

  useEffect(() => {
    setLocalSearchQuery(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    filterItems()
  }, [items, localSearchQuery, selectedFilters, showHidden])

  const loadWardrobeItems = async () => {
    try {
      setLoading(true)
      setError(null)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        setError("Пользователь не авторизован")
        return
      }

      // Получаем данные из правильной таблицы wardrobe_user_items
      const { data, error: fetchError } = await supabase
        .from("wardrobe_user_items")
        .select(`
          *,
          clothing_type:clothing_types(id, name, category)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (fetchError) {
        console.error("Error fetching wardrobe items:", fetchError)
        setError("Ошибка загрузки гардероба")
        return
      }

      // Проверяем что data это массив
      const wardrobeItems = Array.isArray(data) ? data : []
      setItems(wardrobeItems)
    } catch (err) {
      console.error("Error loading wardrobe items:", err)
      setError("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }

  const filterItems = () => {
    if (!Array.isArray(items)) {
      setFilteredItems([])
      return
    }

    let filtered = [...items]

    // Фильтр по видимости
    if (!showHidden) {
      filtered = filtered.filter((item) => item.is_visible !== false)
    }

    // Поиск по названию
    if (localSearchQuery.trim()) {
      const query = localSearchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (item) =>
          item.name?.toLowerCase().includes(query) ||
          item.color?.toLowerCase().includes(query) ||
          item.shade?.toLowerCase().includes(query) ||
          item.clothing_type?.name?.toLowerCase().includes(query),
      )
    }

    // Применяем фильтры
    if (selectedFilters) {
      // Фильтр по категориям
      if (Array.isArray(selectedFilters.categories) && selectedFilters.categories.length > 0) {
        filtered = filtered.filter(
          (item) => item.clothing_type && selectedFilters.categories.includes(item.clothing_type.category),
        )
      }

      // Фильтр по цветам
      if (Array.isArray(selectedFilters.colors) && selectedFilters.colors.length > 0) {
        filtered = filtered.filter((item) => selectedFilters.colors.includes(item.color))
      }

      // Фильтр по типам одежды
      if (Array.isArray(selectedFilters.types) && selectedFilters.types.length > 0) {
        filtered = filtered.filter(
          (item) => item.clothing_type && selectedFilters.types.includes(item.clothing_type.name),
        )
      }
    }

    setFilteredItems(filtered)
  }

  const handleItemUpdate = (updatedItem: WardrobeItem) => {
    setItems((prevItems) =>
      Array.isArray(prevItems) ? prevItems.map((item) => (item.id === updatedItem.id ? updatedItem : item)) : [],
    )
  }

  const handleItemDelete = (deletedItemId: string) => {
    setItems((prevItems) => (Array.isArray(prevItems) ? prevItems.filter((item) => item.id !== deletedItemId) : []))
  }

  const toggleItemVisibility = async (item: WardrobeItem) => {
    try {
      const newVisibility = !item.is_visible

      const { error } = await supabase
        .from("wardrobe_user_items")
        .update({ is_visible: newVisibility })
        .eq("id", item.id)

      if (error) {
        console.error("Error updating item visibility:", error)
        return
      }

      // Обновляем локальное состояние
      handleItemUpdate({ ...item, is_visible: newVisibility })
    } catch (error) {
      console.error("Error toggling item visibility:", error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square w-full" />
              <CardContent className="p-3">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadWardrobeItems} variant="outline">
          Попробовать снова
        </Button>
      </div>
    )
  }

  const itemsToShow = Array.isArray(filteredItems) ? filteredItems : []

  return (
    <div className="space-y-6">
      {/* Заголовок и управление */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мой гардероб</h1>
          <p className="text-gray-600">
            {itemsToShow.length} {itemsToShow.length === 1 ? "вещь" : "вещей"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
            className={showHidden ? "bg-gray-100" : ""}
          >
            {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsFiltersOpen(true)}>
            <Filter className="h-4 w-4" />
          </Button>
          <Button onClick={() => setIsAddSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Поиск по названию, цвету, типу..."
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Сетка элементов */}
      {itemsToShow.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {localSearchQuery || selectedFilters ? "Ничего не найдено" : "Ваш гардероб пуст"}
          </p>
          <Button onClick={() => setIsAddSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить первую вещь
          </Button>
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" : "space-y-4"}>
          {itemsToShow.map((item) => (
            <Card
              key={item.id}
              className={`overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${
                !item.is_visible ? "opacity-50" : ""
              }`}
              onClick={() => setSelectedItem(item)}
            >
              <div className="relative">
                <OptimizedImage src={item.image_url} alt={item.name} className="aspect-square w-full object-cover" />
                {!item.is_visible && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="text-xs">
                      Скрыто
                    </Badge>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 left-2 h-8 w-8 p-0 bg-white/80 hover:bg-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleItemVisibility(item)
                  }}
                >
                  {item.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
              <CardContent className="p-3">
                <h3 className="font-medium text-sm mb-1 line-clamp-1">{item.name}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="capitalize">{item.color}</span>
                  {item.shade && <span>• {item.shade}</span>}
                </div>
                {item.clothing_type && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {item.clothing_type.name}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Модальные окна */}
      <AddToClosetSheet
        isOpen={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
        onItemAdded={loadWardrobeItems}
      />

      <WardrobeFilters isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} onFiltersChange={() => {}} />

      {selectedItem && (
        <ItemDetailsModal
          item={selectedItem}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onEdit={(item) => {
            setSelectedItem(null)
            setEditingItem(item)
          }}
          onDelete={handleItemDelete}
        />
      )}

      {editingItem && (
        <EditWardrobeItemModal
          item={editingItem}
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          onUpdate={handleItemUpdate}
        />
      )}
    </div>
  )
}
