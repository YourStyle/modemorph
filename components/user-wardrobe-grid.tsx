"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Edit } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface WardrobeItem {
  id: number
  item_name: string
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string
  has_details?: string
  size_type?: string
  notes?: string
  image_url?: string
  clothing_type?: string
  created_at?: string
}

interface UserWardrobeGridProps {
  onItemsChange?: (count: number) => void
  refreshTrigger?: number
  searchQuery?: string
  sortBy?: string
}

// Skeleton component for loading state
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

export function UserWardrobeGrid({
  onItemsChange,
  refreshTrigger,
  searchQuery = "",
  sortBy = "newest",
}: UserWardrobeGridProps) {
  const [allItems, setAllItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { toast } = useToast()

  const fetchItems = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const data = await response.json()
        const items = Array.isArray(data) ? data : []
        setAllItems(items)
        onItemsChange?.(items.length)
      } else {
        console.error("Failed to fetch user items")
        setAllItems([])
        onItemsChange?.(0)
      }
    } catch (error) {
      console.error("Error fetching user items:", error)
      setAllItems([])
      onItemsChange?.(0)
    } finally {
      setLoading(false)
    }
  }

  // Фильтрация и сортировка на клиенте
  useEffect(() => {
    let filtered = [...allItems]

    // Поиск по названию
    if (searchQuery.trim()) {
      filtered = filtered.filter((item) => item.item_name.toLowerCase().includes(searchQuery.toLowerCase()))
    }

    // Сортировка
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime()
        case "name":
          return a.item_name.localeCompare(b.item_name)
        case "newest":
        default:
          return new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
      }
    })

    setFilteredItems(filtered)
  }, [allItems, searchQuery, sortBy])

  useEffect(() => {
    fetchItems()
  }, [refreshTrigger])

  const handleDelete = async (id: number) => {
    try {
      setDeletingId(id)
      const response = await fetch(`/api/wardrobe-user-items/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Вещь удалена",
          description: "Вещь успешно удалена из гардероба",
        })
        fetchItems() // Refresh the list
      } else {
        throw new Error("Failed to delete item")
      }
    } catch (error) {
      console.error("Error deleting item:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить вещь",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <UserWardrobeSkeleton />
  }

  if (filteredItems.length === 0 && searchQuery.trim()) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Ничего не найдено по запросу "{searchQuery}"</p>
        <p className="text-gray-400 text-sm mt-1">Попробуйте изменить поисковый запрос</p>
      </div>
    )
  }

  if (allItems.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">У вас пока нет вещей в гардеробе</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {filteredItems.map((item) => (
        <Card key={item.id} className="bg-white border-0 shadow-sm overflow-hidden relative group">
          <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
            {item.image_url ? (
              <img
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = "none"
                  target.nextElementSibling?.classList.remove("hidden")
                }}
              />
            ) : null}
            <span className={`text-2xl ${item.image_url ? "hidden" : ""}`}>👕</span>

            {/* Action buttons - показываются при наведении на десктопе, всегда видны на мобильных */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 w-7 p-0 bg-white/90 hover:bg-white shadow-sm"
                onClick={() => {
                  // TODO: Implement edit functionality
                  toast({
                    title: "Функция в разработке",
                    description: "Редактирование вещей будет доступно в следующем обновлении",
                  })
                }}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 w-7 p-0 bg-red-500/90 hover:bg-red-500 shadow-sm"
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
              >
                {deletingId === item.id ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          <div className="p-3">
            <h3 className="font-medium text-gray-900 text-xs mb-1 line-clamp-2 leading-tight">{item.item_name}</h3>

            {/* Item details */}
            <div className="space-y-1 mb-2">
              {item.color && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Цвет:</span> {item.color}
                  {item.shade && ` (${item.shade})`}
                </p>
              )}
              {item.material && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Материал:</span> {item.material}
                </p>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {item.style && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600">
                  {item.style}
                </Badge>
              )}
              {item.has_print && item.has_print !== "нет" && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600">
                  {item.has_print}
                </Badge>
              )}
              {item.size_type && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-green-100 text-green-600">
                  {item.size_type}
                </Badge>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
