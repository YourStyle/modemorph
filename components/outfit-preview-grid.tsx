"use client"

import { useState } from "react"
import { Package } from "lucide-react"
import Image from "next/image"
import { ItemDetailsModal } from "./item-details-modal"
import type { WardrobeItem } from "./item-details-modal"

interface OutfitItem {
  position: number
  wardrobe_items: {
    id: number
    item_name: string
    image_url?: string
    color?: string
    shade?: string
    material?: string
    style?: string
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
    user_id?: string
    basic_wardrobe_items?: {
      name_ru: string
      image_url?: string
    }
  }
}

interface OutfitPreviewGridProps {
  items: OutfitItem[]
  className?: string
}

export function OutfitPreviewGrid({ items, className = "" }: OutfitPreviewGridProps) {
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})

  const handleImageError = (itemId: number) => {
    setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  }

  const handleItemClick = (item: OutfitItem["wardrobe_items"]) => {
    // Преобразуем в формат WardrobeItem для модального окна
    const wardrobeItem: WardrobeItem = {
      ...item,
    }
    setSelectedItem(wardrobeItem)
  }

  const getImageSrc = (item: OutfitItem) => {
    return item.wardrobe_items.image_url || item.wardrobe_items.basic_wardrobe_items?.image_url
  }

  const getItemName = (item: OutfitItem) => {
    return item.wardrobe_items.item_name || item.wardrobe_items.basic_wardrobe_items?.name_ru || "Без названия"
  }

  // Сортируем элементы по позиции
  const sortedItems = [...items].sort((a, b) => a.position - b.position)

  // Определяем сетку в зависимости от количества элементов
  const getGridClass = () => {
    if (sortedItems.length <= 2) return "grid-cols-1"
    if (sortedItems.length <= 4) return "grid-cols-2"
    return "grid-cols-2"
  }

  return (
    <>
      <div className={`grid ${getGridClass()} gap-2 h-full ${className}`}>
        {sortedItems.slice(0, 4).map((item, index) => {
          const imageSrc = getImageSrc(item)
          const itemName = getItemName(item)
          const hasError = imageErrors[item.wardrobe_items.id]

          return (
            <div
              key={`${item.wardrobe_items.id}-${item.position}`}
              className="relative bg-white rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200 group"
              onClick={() => handleItemClick(item.wardrobe_items)}
            >
              {imageSrc && !hasError ? (
                <Image
                  src={imageSrc || "/placeholder.svg"}
                  alt={itemName}
                  fill
                  className="object-cover"
                  onError={() => handleImageError(item.wardrobe_items.id)}
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <Package className="h-6 w-6 text-gray-400" />
                </div>
              )}

              {/* Hover overlay with item name */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <span className="text-white text-xs font-medium text-center px-2">{itemName}</span>
              </div>

              {/* Position indicator */}
              <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                {item.position}
              </div>
            </div>
          )
        })}

        {/* Show more items indicator */}
        {sortedItems.length > 4 && (
          <div className="relative bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-gray-600 text-sm font-medium">+{sortedItems.length - 4}</span>
          </div>
        )}
      </div>

      {/* Item Details Modal */}
      {selectedItem && (
        <ItemDetailsModal item={selectedItem} isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </>
  )
}
