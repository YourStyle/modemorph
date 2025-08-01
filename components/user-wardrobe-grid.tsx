"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { WardrobeItemCard } from "./wardrobe-item-card"
import { WardrobeFilters } from "./wardrobe-filters"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

interface WardrobeItem {
  id: string
  name: string
  type: string
  color: string
  material: string
  image_url: string
  created_at: string
  updated_at: string
  user_id: string
}

export function UserWardrobeGrid() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  const supabase = createClientComponentClient()

  useEffect(() => {
    fetchWardrobeItems()
  }, [])

  const fetchWardrobeItems = async () => {
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

      // Простой запрос без связей с другими таблицами
      const { data, error: fetchError } = await supabase
        .from("wardrobe_user_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (fetchError) {
        console.error("Error fetching wardrobe items:", fetchError)
        setError(`Ошибка загрузки: ${fetchError.message}`)
        return
      }

      const wardrobeItems = Array.isArray(data) ? data : []
      setItems(wardrobeItems)
      setFilteredItems(wardrobeItems)
    } catch (err) {
      console.error("Error fetching wardrobe items:", err)
      setError("Произошла ошибка при загрузке гардероба")
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (filters: { search: string; types: string[] }) => {
    if (!Array.isArray(items)) {
      setFilteredItems([])
      return
    }

    let filtered = [...items]

    // Фильтр по поиску
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          (item.name || "").toLowerCase().includes(searchLower) ||
          (item.color || "").toLowerCase().includes(searchLower) ||
          (item.material || "").toLowerCase().includes(searchLower) ||
          (item.type || "").toLowerCase().includes(searchLower),
      )
    }

    // Фильтр по типам
    if (Array.isArray(filters.types) && filters.types.length > 0) {
      filtered = filtered.filter((item) => filters.types.includes(item.type || ""))
    }

    setFilteredItems(filtered)
    setSelectedTypes(Array.isArray(filters.types) ? filters.types : [])
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <WardrobeFilters onFilterChange={handleFilterChange} selectedTypes={selectedTypes} />

      {Array.isArray(filteredItems) && filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {Array.isArray(items) && items.length === 0
              ? "Ваш гардероб пуст. Добавьте первую вещь!"
              : "Ничего не найдено по заданным фильтрам"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.isArray(filteredItems) && filteredItems.map((item) => <WardrobeItemCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
