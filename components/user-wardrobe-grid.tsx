"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Search, Edit, Trash2, Package, Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { EditWardrobeItemModal } from "./edit-wardrobe-item-modal"

interface WardrobeItem {
  id: number
  item_name: string
  image_url: string
  color: string
  shade?: string
  style?: string
  material?: string
  url?: string
  size_type?: string
  has_print?: string
  has_details?: string
  notes?: string
  is_basic: boolean
  basic_item_id?: number | null
  created_at: string
  updated_at: string
  basic_material_id?: number | null
  is_hidden: boolean
  user_id: string
}

interface UserWardrobeGridProps {
  items: WardrobeItem[]
  onItemsChange: () => void
}

export function UserWardrobeGrid({ items, onItemsChange }: UserWardrobeGridProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [filterBy, setFilterBy] = useState<string>("all")
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})

  // Get unique colors and materials for filtering
  const uniqueColors = useMemo(() => {
    const colors = items.map((item) => item.color).filter(Boolean)
    return [...new Set(colors)].sort()
  }, [items])

  const uniqueMaterials = useMemo(() => {
    const materials = items.map((item) => item.material).filter(Boolean)
    return [...new Set(materials)].sort()
  }, [items])

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    const filtered = items.filter((item) => {
      // Search filter
      const matchesSearch =
        searchTerm === "" ||
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.color?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.style?.toLowerCase().includes(searchTerm.toLowerCase())

      // Category filter
      const matchesFilter =
        filterBy === "all" ||
        (filterBy === "basic" && item.is_basic) ||
        (filterBy === "user" && !item.is_basic) ||
        (filterBy === "hidden" && item.is_hidden) ||
        (filterBy === "visible" && !item.is_hidden) ||
        item.color === filterBy ||
        item.material === filterBy

      return matchesSearch && matchesFilter
    })

    // Sort items
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "name":
          return a.item_name.localeCompare(b.item_name)
        case "color":
          return (a.color || "").localeCompare(b.color || "")
        default:
          return 0
      }
    })

    return filtered
  }, [items, searchTerm, sortBy, filterBy])

  const handleImageError = (itemId: number) => {
    setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  }

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm("Вы уверены, что хотите удалить эту вещь?")) {
      return
    }

    try {
      const response = await fetch(`/api/wardrobe-user-items/${itemId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Вещь удалена")
        onItemsChange()
      } else {
        throw new Error("Failed to delete item")
      }
    } catch (error) {
      console.error("Error deleting item:", error)
      toast.error("Ошибка при удалении вещи")
    }
  }

  const handleToggleVisibility = async (item: WardrobeItem) => {
    try {
      const response = await fetch(`/api/wardrobe-user-items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_hidden: !item.is_hidden,
        }),
      })

      if (response.ok) {
        toast.success(item.is_hidden ? "Вещь показана" : "Вещь скрыта")
        onItemsChange()
      } else {
        throw new Error("Failed to toggle visibility")
      }
    } catch (error) {
      console.error("Error toggling visibility:", error)
      toast.error("Ошибка при изменении видимости")
    }
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Поиск по названию, цвету, материалу..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters and Sort */}
        <div className="flex gap-4 flex-wrap">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Сортировка" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Сначала новые</SelectItem>
              <SelectItem value="oldest">Сначала старые</SelectItem>
              <SelectItem value="name">По названию</SelectItem>
              <SelectItem value="color">По цвету</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Фильтр" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все вещи</SelectItem>
              <SelectItem value="basic">Базовые</SelectItem>
              <SelectItem value="user">Пользовательские</SelectItem>
              <SelectItem value="visible">Видимые</SelectItem>
              <SelectItem value="hidden">Скрытые</SelectItem>
              {uniqueColors.length > 0 && (
                <>
                  <SelectItem value="color-separator" disabled>
                    — Цвета —
                  </SelectItem>
                  {uniqueColors.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color}
                    </SelectItem>
                  ))}
                </>
              )}
              {uniqueMaterials.length > 0 && (
                <>
                  <SelectItem value="material-separator" disabled>
                    — Материалы —
                  </SelectItem>
                  {uniqueMaterials.map((material) => (
                    <SelectItem key={material} value={material}>
                      {material}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <div className="text-sm text-gray-500">
          Найдено: {filteredAndSortedItems.length} из {items.length} вещей
        </div>
      </div>

      {/* Items Grid */}
      {filteredAndSortedItems.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {searchTerm || filterBy !== "all" ? "Ничего не найдено" : "Нет вещей в гардеробе"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredAndSortedItems.map((item) => {
            const hasError = imageErrors[item.id]

            return (
              <Card key={item.id} className={`overflow-hidden ${item.is_hidden ? "opacity-50" : ""}`}>
                <div className="aspect-square relative">
                  {item.image_url && !hasError ? (
                    <Image
                      src={item.image_url || "/placeholder.svg"}
                      alt={item.item_name}
                      fill
                      className="object-cover"
                      onError={() => handleImageError(item.id)}
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                  )}

                  {/* Overlay with actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditingItem(item)} className="h-8 w-8 p-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleToggleVisibility(item)}
                      className="h-8 w-8 p-0"
                    >
                      {item.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteItem(item.id)}
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-3">
                  <h3 className="font-medium text-sm truncate mb-1">{item.item_name}</h3>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.color && (
                      <Badge variant="secondary" className="text-xs">
                        {item.color}
                      </Badge>
                    )}
                    {item.is_basic && (
                      <Badge variant="outline" className="text-xs">
                        Базовая
                      </Badge>
                    )}
                    {item.is_hidden && (
                      <Badge variant="destructive" className="text-xs">
                        Скрыта
                      </Badge>
                    )}
                  </div>
                  {item.material && <p className="text-xs text-gray-500 truncate">{item.material}</p>}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <EditWardrobeItemModal
          item={editingItem}
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSave={() => {
            setEditingItem(null)
            onItemsChange()
          }}
        />
      )}
    </div>
  )
}
