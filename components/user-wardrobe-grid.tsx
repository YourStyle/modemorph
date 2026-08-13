"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Trash2, Edit, Camera, Sparkles, MoreVertical, Shirt } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { EditWardrobeItemSheet } from "./edit-wardrobe-item-sheet"
import { api } from "@/lib/api-client"
import { normalizeClothingType, clothingCategories } from "@/lib/clothing-types"
import { colorToHex, colorDisplayName } from "@/lib/color-map"
import { cn } from "@/lib/utils"

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
  basic_item_id?: number
  url?: string
  gender?: string
}

interface UserWardrobeGridProps {
  onItemsChange?: (count: number) => void
  refreshTrigger?: number
  searchQuery?: string
  sortBy?: string
  /** Категория из ленты над сеткой ("all" или ключ lib/clothing-types#clothingCategories) */
  categoryFilter?: string
  onAddFirstItem?: () => void
}

// Skeleton component for loading state — карточка того же радиуса (18px), что и
// заполненная, полоски утоплены (.skeleton = --canvas-sunk + shimmer).
const UserWardrobeSkeleton = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <Card key={i} className="border-0 overflow-hidden">
          <div className="skeleton aspect-square" />
          <div className="p-2.5 space-y-2">
            <div className="skeleton h-2.5 rounded-full w-4/5" />
            <div className="skeleton h-2.5 rounded-full w-2/5" />
          </div>
        </Card>
      ))}
    </div>
  )
}

// Максимум шагов лесенки — дальше все карточки появляются с одной задержкой,
// чтобы последние в длинной сетке не всплывали через секунду после первых.
const MAX_STAGGER_STEPS = 8
const STAGGER_STEP_MS = 45

export function UserWardrobeGrid({
  onItemsChange,
  refreshTrigger,
  searchQuery = "",
  sortBy = "newest",
  categoryFilter = "all",
  onAddFirstItem,
}: UserWardrobeGridProps) {
  const [allItems, setAllItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const { toast } = useToast()

  const fetchItems = async () => {
    try {
      setLoading(true)
      const data = await api.get("/api/wardrobe-user-items")
      const items = Array.isArray(data) ? data : []
      setAllItems(items)
      onItemsChange?.(items.length)
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

    // Категория из ленты над сеткой — дополнительный фильтр поверх поиска, не
    // меняет существующую логику поиска/сортировки.
    if (categoryFilter && categoryFilter !== "all") {
      const categoryTypes: readonly string[] | undefined =
        clothingCategories[categoryFilter as keyof typeof clothingCategories]?.types
      if (categoryTypes) {
        filtered = filtered.filter((item) => {
          const canonical = normalizeClothingType(item.clothing_type)
          return !!canonical && categoryTypes.includes(canonical)
        })
      }
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
  }, [allItems, searchQuery, sortBy, categoryFilter])

  useEffect(() => {
    fetchItems()
  }, [refreshTrigger])

  const handleDelete = async (item: WardrobeItem) => {
    if (!confirm(`Удалить «${item.item_name}» из гардероба?`)) return

    try {
      setDeletingId(item.id)
      await api.delete(`/api/wardrobe-user-items/${item.id}`)
      toast({
        title: "Вещь удалена",
        description: "Вещь успешно удалена из гардероба",
      })
      fetchItems() // Refresh the list
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

  const handleEdit = (item: WardrobeItem) => {
    setEditingItem(item)
    setShowEditSheet(true)
  }

  const handleEditSuccess = () => {
    fetchItems() // Refresh the list
    setShowEditSheet(false)
    setEditingItem(null)
  }

  if (loading) {
    return <UserWardrobeSkeleton />
  }

  if (filteredItems.length === 0 && (searchQuery.trim() || (categoryFilter && categoryFilter !== "all"))) {
    return (
      <div className="text-center py-8">
        <p className="text-ink-2">
          {searchQuery.trim() ? `Ничего не найдено по запросу "${searchQuery}"` : "В этой категории пока пусто"}
        </p>
        <p className="text-ink-3 text-caption mt-1">Попробуйте изменить фильтр</p>
      </div>
    )
  }

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 bg-ink">
          <Camera className="w-9 h-9 text-signal-ink" />
        </div>

        <h3 className="text-h2 text-ink mb-2">
          Гардероб пустой
        </h3>

        <p className="text-body text-ink-2 mb-3 max-w-xs">
          Сфотографируйте вещи, и AI распознает их за секунды — цвет, стиль, материал.
          Чем больше вещей — точнее образы от вашего персонального стилиста.
        </p>

        <div className="flex items-center gap-1.5 text-caption text-ink-3 mb-6">
          <Sparkles className="w-3.5 h-3.5 text-ink-3" />
          <span>AI анализирует фото автоматически</span>
        </div>

        {onAddFirstItem && (
          <Button onClick={onAddFirstItem} className="gap-2">
            <Camera className="w-4 h-4" />
            Добавить первую вещь
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredItems.map((item, index) => (
          // ring, а не border: контур ложится внутрь радиуса, иначе светлая вещь
          // на светлой плитке сливается с плиткой (белое, кремовое, бежевое)
          <Card
            key={item.id}
            className="border-0 ring-1 ring-inset ring-line overflow-hidden relative group animate-fade-up"
            style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS - 1) * STAGGER_STEP_MS}ms` }}
          >
            <div className="relative aspect-square bg-canvas-sunk">
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
              <span className={cn("absolute inset-0 flex items-center justify-center", item.image_url ? "hidden" : "")}>
                <Shirt className="h-8 w-8 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
              </span>

              {/* Единственная точка входа к правке/удалению — скрыта за меню, ничего
                  деструктивного не видно на витрине постоянно. */}
              <div className="absolute top-2 right-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="glass h-7 w-7 rounded-full flex items-center justify-center text-ink active:scale-95 transition-transform duration-press"
                      aria-label="Действия с вещью"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="text-red-600 focus:text-red-600"
                    >
                      {deletingId === item.id ? (
                        <div className="w-3.5 h-3.5 mr-2 border border-red-600/40 border-t-red-600 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="px-2.5 pt-2 pb-2.5">
              <h3 className="text-caption font-semibold text-ink truncate">{item.item_name}</h3>
              {(item.color || item.material) && (
                <p className="text-caption text-ink-2 mt-0.5 flex items-center gap-1.5 min-w-0">
                  {item.color && colorToHex(item.color) && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0 border border-line"
                      style={{ backgroundColor: colorToHex(item.color) as string }}
                    />
                  )}
                  <span className="truncate">
                    {[item.shade || colorDisplayName(item.color), item.material].filter(Boolean).join(" · ")}
                  </span>
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <EditWardrobeItemSheet
        item={editingItem}
        isOpen={showEditSheet}
        onClose={() => {
          setShowEditSheet(false)
          setEditingItem(null)
        }}
        onSuccess={handleEditSuccess}
      />
    </>
  )
}
