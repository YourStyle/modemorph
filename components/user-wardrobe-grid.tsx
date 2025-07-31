"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Filter, Grid, List } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { WardrobeItemCard } from "@/components/wardrobe-item-card"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface WardrobeItem {
  id: string
  name: string
  type: string
  color: string
  material?: string
  brand?: string
  season?: string
  image_url?: string
  tags?: string[]
  created_at: string
  updated_at: string
}

interface UserWardrobeGridProps {
  userId?: string
}

export function UserWardrobeGrid({ userId }: UserWardrobeGridProps) {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "type" | "created_at">("created_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterSeason, setFilterSeason] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [availableTypes, setAvailableTypes] = useState<string[]>([])
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([])

  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    loadWardrobeItems()
  }, [userId])

  const loadWardrobeItems = async () => {
    try {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error("User not authenticated")
      }

      const targetUserId = userId || user.id

      const { data, error } = await supabase
        .from("wardrobe_user_items")
        .select(`
          id,
          name,
          type,
          color,
          material,
          brand,
          season,
          image_url,
          tags,
          created_at,
          updated_at
        `)
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })

      if (error) {
        throw error
      }

      setItems(data || [])

      // Extract unique types and seasons for filters
      const types = [...new Set(data?.map((item) => item.type).filter(Boolean) || [])]
      const seasons = [...new Set(data?.map((item) => item.season).filter(Boolean) || [])]

      setAvailableTypes(types)
      setAvailableSeasons(seasons)
    } catch (error) {
      console.error("Error loading wardrobe items:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить вещи из гардероба",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredAndSortedItems = useMemo(() => {
    let filtered = items

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.name?.toLowerCase().includes(query) ||
          item.type?.toLowerCase().includes(query) ||
          item.brand?.toLowerCase().includes(query) ||
          item.material?.toLowerCase().includes(query) ||
          item.tags?.some((tag) => tag.toLowerCase().includes(query)),
      )
    }

    // Apply type filter
    if (filterType !== "all") {
      filtered = filtered.filter((item) => item.type === filterType)
    }

    // Apply season filter
    if (filterSeason !== "all") {
      filtered = filtered.filter((item) => item.season === filterSeason)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number = ""
      let bValue: string | number = ""

      switch (sortBy) {
        case "name":
          aValue = a.name || ""
          bValue = b.name || ""
          break
        case "type":
          aValue = a.type || ""
          bValue = b.type || ""
          break
        case "created_at":
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortOrder === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }

      return sortOrder === "asc" ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
    })

    return filtered
  }, [items, searchQuery, sortBy, sortOrder, filterType, filterSeason])

  const handleItemUpdate = (updatedItem: WardrobeItem) => {
    setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)))
  }

  const handleItemDelete = (deletedItemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== deletedItemId))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Filters skeleton */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="aspect-square w-full mb-4" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Поиск по названию, типу, бренду..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters and Sort */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex flex-wrap gap-2 flex-1">
            {/* Type Filter */}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Тип вещи" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Season Filter */}
            <Select value={filterSeason} onValueChange={setFilterSeason}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Сезон" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все сезоны</SelectItem>
                {availableSeasons.map((season) => (
                  <SelectItem key={season} value={season}>
                    {season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select
              value={`${sortBy}-${sortOrder}`}
              onValueChange={(value) => {
                const [field, order] = value.split("-")
                setSortBy(field as typeof sortBy)
                setSortOrder(order as typeof sortOrder)
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Сортировка" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at-desc">Сначала новые</SelectItem>
                <SelectItem value="created_at-asc">Сначала старые</SelectItem>
                <SelectItem value="name-asc">По названию А-Я</SelectItem>
                <SelectItem value="name-desc">По названию Я-А</SelectItem>
                <SelectItem value="type-asc">По типу А-Я</SelectItem>
                <SelectItem value="type-desc">По типу Я-А</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-1 border rounded-lg p-1">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="h-8 w-8 p-0"
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-8 w-8 p-0"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Active Filters */}
        {(searchQuery || filterType !== "all" || filterSeason !== "all") && (
          <div className="flex flex-wrap gap-2">
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                Поиск: {searchQuery}
                <button
                  onClick={() => setSearchQuery("")}
                  className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </Badge>
            )}
            {filterType !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Тип: {filterType}
                <button
                  onClick={() => setFilterType("all")}
                  className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </Badge>
            )}
            {filterSeason !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Сезон: {filterSeason}
                <button
                  onClick={() => setFilterSeason("all")}
                  className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Найдено: {filteredAndSortedItems.length} из {items.length} вещей
      </div>

      {/* Items Grid/List */}
      {filteredAndSortedItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Filter className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {items.length === 0 ? "Гардероб пуст" : "Ничего не найдено"}
          </h3>
          <p className="text-gray-600">
            {items.length === 0
              ? "Добавьте первую вещь в свой гардероб"
              : "Попробуйте изменить параметры поиска или фильтры"}
          </p>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-4"
          }
        >
          {filteredAndSortedItems.map((item) => (
            <WardrobeItemCard
              key={item.id}
              item={item}
              viewMode={viewMode}
              onUpdate={handleItemUpdate}
              onDelete={handleItemDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
