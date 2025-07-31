"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { WardrobeItemCard } from "@/components/wardrobe-item-card"
import { WardrobeFilters } from "@/components/wardrobe-filters"
import { Button } from "@/components/ui/button"
import { Plus, Search, Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"

interface WardrobeItem {
  id: string
  name: string
  category: string
  color: string
  brand?: string
  image_url?: string
  tags?: string[]
  created_at: string
  user_id: string
}

interface FilterState {
  category: string
  color: string
  brand: string
  tags: string[]
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    category: "",
    color: "",
    brand: "",
    tags: [],
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

      const { data, error: fetchError } = await supabase
        .from("wardrobe_items")
        .select("*")
        .eq("user_id", user.id)
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
          item.name?.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query) ||
          item.brand?.toLowerCase().includes(query) ||
          (Array.isArray(item.tags) && item.tags.some((tag) => tag.toLowerCase().includes(query))),
      )
    }

    // Фильтр по категории
    if (filters.category) {
      filtered = filtered.filter((item) => item.category === filters.category)
    }

    // Фильтр по цвету
    if (filters.color) {
      filtered = filtered.filter((item) => item.color === filters.color)
    }

    // Фильтр по бренду
    if (filters.brand) {
      filtered = filtered.filter((item) => item.brand === filters.brand)
    }

    // Фильтр по тегам
    if (Array.isArray(filters.tags) && filters.tags.length > 0) {
      filtered = filtered.filter((item) =>
        Array.isArray(item.tags) ? filters.tags.some((tag) => item.tags.includes(tag)) : false,
      )
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
      brand: "",
      tags: [],
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
            placeholder="Поиск по названию, категории, бренду..."
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

      {/* Filters Panel */}
      {showFilters && (
        <WardrobeFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          items={Array.isArray(items) ? items : []}
        />
      )}

      {/* Results Info */}
      {(searchQuery || filters.category || filters.color || filters.brand || filters.tags.length > 0) && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Показано {itemsToShow.length} из {Array.isArray(items) ? items.length : 0} предметов
          </span>
          {(searchQuery || filters.category || filters.color || filters.brand || filters.tags.length > 0) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Сбросить фильтры
            </Button>
          )}
        </div>
      )}

      {/* Items Grid */}
      {itemsToShow.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
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
            <WardrobeItemCard key={item.id} item={item} onUpdate={loadWardrobeItems} />
          ))}
        </div>
      )}
    </div>
  )
}
