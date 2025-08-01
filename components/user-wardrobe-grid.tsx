"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { WardrobeItemCard } from "./wardrobe-item-card"
import { WardrobeFilters } from "./wardrobe-filters"
import { Button } from "@/components/ui/button"
import { Plus, Grid, List } from "lucide-react"
import { useRouter } from "next/navigation"

interface WardrobeItem {
  id: string
  name: string
  category: string
  color: string
  brand?: string
  image_url: string
  created_at: string
  updated_at: string
  user_id: string
  visibility: string
  tags?: string[]
  season?: string
  material?: string
  size?: string
  purchase_date?: string
  price?: number
  notes?: string
}

interface FilterState {
  category: string
  color: string
  season: string
  search: string
  sortBy: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [filters, setFilters] = useState<FilterState>({
    category: "",
    color: "",
    season: "",
    search: "",
    sortBy: "created_at",
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadWardrobeItems()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [items, filters])

  const loadWardrobeItems = async () => {
    try {
      setLoading(true)
      setError(null)

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        setError("Необходимо войти в систему")
        return
      }

      const { data, error: fetchError } = await supabase
        .from("wardrobe_user_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (fetchError) {
        console.error("Error fetching wardrobe items:", fetchError)
        setError("Ошибка загрузки гардероба")
        return
      }

      const wardrobeItems = Array.isArray(data) ? data : []
      setItems(wardrobeItems)
    } catch (err) {
      console.error("Error loading wardrobe:", err)
      setError("Ошибка загрузки гардероба")
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

    // Фильтр по категории
    if (filters.category) {
      filtered = filtered.filter((item) => item.category?.toLowerCase().includes(filters.category.toLowerCase()))
    }

    // Фильтр по цвету
    if (filters.color) {
      filtered = filtered.filter((item) => item.color?.toLowerCase().includes(filters.color.toLowerCase()))
    }

    // Фильтр по сезону
    if (filters.season) {
      filtered = filtered.filter((item) => item.season?.toLowerCase().includes(filters.season.toLowerCase()))
    }

    // Поиск по названию
    if (filters.search) {
      filtered = filtered.filter(
        (item) =>
          item.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.brand?.toLowerCase().includes(filters.search.toLowerCase()) ||
          (Array.isArray(item.tags) &&
            item.tags.some((tag) => tag.toLowerCase().includes(filters.search.toLowerCase()))),
      )
    }

    // Сортировка
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case "name":
          return (a.name || "").localeCompare(b.name || "")
        case "category":
          return (a.category || "").localeCompare(b.category || "")
        case "color":
          return (a.color || "").localeCompare(b.color || "")
        case "created_at":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    setFilteredItems(filtered)
  }

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }

  const handleAddItem = () => {
    router.push("/app/wardrobe/add")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse"></div>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мой гардероб</h1>
          <p className="text-gray-600">
            {Array.isArray(filteredItems) ? filteredItems.length : 0} из {Array.isArray(items) ? items.length : 0} вещей
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg">
            <Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("grid")}>
              <Grid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить вещь
          </Button>
        </div>
      </div>

      {/* Filters */}
      <WardrobeFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        itemsCount={Array.isArray(filteredItems) ? filteredItems.length : 0}
      />

      {/* Items Grid */}
      {Array.isArray(filteredItems) && filteredItems.length > 0 ? (
        <div
          className={
            viewMode === "grid" ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" : "space-y-4"
          }
        >
          {filteredItems.map((item) => (
            <WardrobeItemCard key={item.id} item={item} viewMode={viewMode} onUpdate={loadWardrobeItems} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {Array.isArray(items) && items.length === 0
              ? "В вашем гардеробе пока нет вещей"
              : "Не найдено вещей по заданным фильтрам"}
          </p>
          {Array.isArray(items) && items.length === 0 && (
            <Button onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить первую вещь
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
