"use client"

import { useState, useEffect, useMemo } from "react"
import { WardrobeItemCard } from "./wardrobe-item-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, SortAsc } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface WardrobeItem {
  id: number
  user_id: string
  item_name: string
  size_type: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  url: string
  created_at: string
  updated_at: string
  is_basic: boolean
  basic_item_id: number | null
  notes: string
  basic_material_id: number | null
  is_hidden: boolean
  image_url: string
}

interface UserWardrobeGridProps {
  userId: string
}

export function UserWardrobeGrid({ userId }: UserWardrobeGridProps) {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest")

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/wardrobe-user-items?user_id=${userId}`)

        if (!response.ok) {
          throw new Error("Failed to fetch wardrobe items")
        }

        const data = await response.json()
        setItems(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchItems()
    }
  }, [userId])

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = items

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = items.filter((item) => item.item_name.toLowerCase().includes(query))
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "name":
          return a.item_name.localeCompare(b.item_name, "ru")
        default:
          return 0
      }
    })

    return sorted
  }, [items, searchQuery, sortBy])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Filters skeleton */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-48" />
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Ошибка загрузки: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Попробовать снова
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <SortAsc className="text-gray-400 w-4 h-4" />
          <Select value={sortBy} onValueChange={(value: "newest" | "oldest" | "name") => setSortBy(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Сначала новые</SelectItem>
              <SelectItem value="oldest">Сначала старые</SelectItem>
              <SelectItem value="name">По названию</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-600">
        {searchQuery ? (
          <>
            Найдено {filteredAndSortedItems.length} из {items.length} вещей
            {filteredAndSortedItems.length === 0 && (
              <span className="block mt-1 text-gray-500">
                Попробуйте изменить поисковый запрос или очистить фильтры
              </span>
            )}
          </>
        ) : (
          `Всего вещей: ${items.length}`
        )}
      </div>

      {/* Grid */}
      {filteredAndSortedItems.length === 0 ? (
        <div className="text-center py-12">
          {searchQuery ? (
            <div>
              <p className="text-gray-600 mb-2">Ничего не найдено по запросу "{searchQuery}"</p>
              <button onClick={() => setSearchQuery("")} className="text-blue-600 hover:text-blue-700 underline">
                Очистить поиск
              </button>
            </div>
          ) : (
            <p className="text-gray-600">Пока нет вещей в гардеробе</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredAndSortedItems.map((item) => (
            <WardrobeItemCard
              key={item.id}
              id={item.id}
              name={item.item_name}
              imageUrl={item.image_url}
              color={item.color}
              shade={item.shade}
              material={item.material}
              style={item.style}
              hasDetails={item.has_details}
              hasPrint={item.has_print}
              size={item.size_type}
              isBasic={item.is_basic}
              notes={item.notes}
              onUpdate={() => {
                // Refresh the items list
                window.location.reload()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
