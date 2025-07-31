"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, Search, Filter, Package } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

interface WardrobeUserItem {
  id: number
  user_id: string
  item_name: string
  material: string
  color: string
  style: string
  has_print: string
  image_url: string | null
  basic_item_id: number | null
  is_hidden: boolean
  size_type: string
  shade: string
  has_details: string
  url: string
  notes: string
  created_at: string
  updated_at: string
}

interface FilterState {
  category: string
  color: string
  material: string
  style: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeUserItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    category: "",
    color: "",
    material: "",
    style: "",
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadWardrobeItems()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [items, searchQuery, filters])

  const loadWardrobeItems = async () => {
    try {
      setLoading(true)
      setError(null)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError("Пользователь не авторизован")
        return
      }

      // Получаем данные из правильной таблицы wardrobe_user_items
      const { data, error: fetchError } = await supabase
        .from("wardrobe_user_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })

      if (fetchError) {
        console.error("Error fetching wardrobe items:", fetchError)
        setError("Ошибка загрузки гардероба")
        return
      }

      // Убеждаемся, что data это массив
      const wardrobeItems = Array.isArray(data) ? data : []
      setItems(wardrobeItems)
    } catch (err) {
      console.error("Error in loadWardrobeItems:", err)
      setError("Произошла ошибка при загрузке")
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    if (!Array.isArray(items)) {
      setFilteredItems([])
      return
    }

    let filtered = [...items]

    // Поиск по названию
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (item) =>
          item.item_name?.toLowerCase().includes(query) ||
          item.color?.toLowerCase().includes(query) ||
          item.material?.toLowerCase().includes(query) ||
          item.style?.toLowerCase().includes(query),
      )
    }

    // Фильтр по цвету
    if (filters.color) {
      filtered = filtered.filter((item) => item.color === filters.color)
    }

    // Фильтр по материалу
    if (filters.material) {
      filtered = filtered.filter((item) => item.material === filters.material)
    }

    // Фильтр по стилю
    if (filters.style) {
      filtered = filtered.filter((item) => item.style === filters.style)
    }

    setFilteredItems(filtered)
  }

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }

  const clearFilters = () => {
    setFilters({
      category: "",
      color: "",
      material: "",
      style: "",
    })
    setSearchQuery("")
  }

  const handleAddItem = () => {
    router.push("/app/wardrobe/add")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Search and filters skeleton */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 h-10 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-red-500 text-center">
          <p className="text-lg font-medium">Ошибка загрузки</p>
          <p className="text-sm">{error}</p>
        </div>
        <Button onClick={loadWardrobeItems} variant="outline">
          Попробовать снова
        </Button>
      </div>
    )
  }

  const itemsToShow = Array.isArray(filteredItems) ? filteredItems : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мой гардероб</h1>
          <p className="text-sm text-gray-600 mt-1">{Array.isArray(items) ? items.length : 0} предметов в коллекции</p>
        </div>
        <Button onClick={handleAddItem} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Добавить вещь
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Поиск по названию, цвету, материалу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Фильтры
        </Button>
      </div>

      {/* Results Info */}
      {(searchQuery || filters.color || filters.material || filters.style) && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Показано {itemsToShow.length} из {Array.isArray(items) ? items.length : 0} предметов
          </span>
          {(searchQuery || filters.color || filters.material || filters.style) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Сбросить фильтры
            </Button>
          )}
        </div>
      )}

      {/* Items Grid */}
      {itemsToShow.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Package className="w-16 h-16 text-gray-300" />
          <div className="text-gray-500 text-center">
            <p className="text-lg font-medium">
              {Array.isArray(items) && items.length === 0 ? "Ваш гардероб пуст" : "Ничего не найдено"}
            </p>
            <p className="text-sm">
              {Array.isArray(items) && items.length === 0
                ? "Добавьте первую вещь в свой гардероб"
                : "Попробуйте изменить параметры поиска"}
            </p>
          </div>
          {Array.isArray(items) && items.length === 0 && (
            <Button onClick={handleAddItem} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Добавить первую вещь
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {itemsToShow.map((item) => (
            <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-square relative">
                {item.image_url ? (
                  <Image
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.item_name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Package className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <h3 className="font-medium text-sm truncate mb-1">{item.item_name}</h3>
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.color && (
                    <Badge variant="secondary" className="text-xs">
                      {item.color}
                    </Badge>
                  )}
                  {item.material && (
                    <Badge variant="outline" className="text-xs">
                      {item.material}
                    </Badge>
                  )}
                </div>
                {item.style && <p className="text-xs text-gray-500 truncate">{item.style}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
