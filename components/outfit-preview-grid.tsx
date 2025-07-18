"use client"

import { useState } from "react"
import Image from "next/image"
import { Package } from "lucide-react"

interface OutfitItem {
  id: number
  position: number
  wardrobe_items: {
    id: number
    item_name: string
    image_url?: string
    color?: string
    material?: string
    style?: string
  }
}

interface OutfitPreviewGridProps {
  items: OutfitItem[]
  maxItems?: number
  className?: string
}

export function OutfitPreviewGrid({ items, maxItems = 6, className = "" }: OutfitPreviewGridProps) {
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set())

  const handleImageError = (itemId: number) => {
    setImageErrors((prev) => new Set(prev).add(itemId))
  }

  const displayItems = items.slice(0, maxItems)

  if (!displayItems || displayItems.length === 0) {
    return (
      <div className={`aspect-square bg-gray-100 rounded-lg flex items-center justify-center ${className}`}>
        <Package className="h-8 w-8 text-gray-400" />
      </div>
    )
  }

  // Определяем сетку в зависимости от количества элементов
  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    return "grid-cols-3"
  }

  return (
    <div className={`aspect-square bg-gray-50 rounded-lg overflow-hidden ${className}`}>
      <div className={`grid ${getGridClass(displayItems.length)} gap-1 h-full p-1`}>
        {displayItems.map((item) => {
          const hasError = imageErrors.has(item.wardrobe_items.id)
          const imageUrl = item.wardrobe_items.image_url

          return (
            <div key={item.id} className="relative bg-white rounded-md overflow-hidden">
              {imageUrl && !hasError ? (
                <Image
                  src={imageUrl || "/placeholder.svg"}
                  alt={item.wardrobe_items.item_name}
                  fill
                  className="object-cover"
                  onError={() => handleImageError(item.wardrobe_items.id)}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <Package className="h-4 w-4 text-gray-400" />
                </div>
              )}

              {/* Overlay с информацией о вещи */}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors duration-200 flex items-end">
                <div className="w-full p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-200">
                  <p className="text-white text-xs font-medium truncate">{item.wardrobe_items.item_name}</p>
                </div>
              </div>
            </div>
          )
        })}

        {/* Показываем количество дополнительных элементов, если их больше maxItems */}
        {items.length > maxItems && (
          <div className="bg-gray-200 rounded-md flex items-center justify-center">
            <span className="text-gray-600 text-sm font-medium">+{items.length - maxItems}</span>
          </div>
        )}
      </div>
    </div>
  )
}
