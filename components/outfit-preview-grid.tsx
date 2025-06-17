"use client"

import { useEffect } from "react"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"
import { imageCache } from "@/lib/image-cache"

interface OutfitItem {
  id: number
  wardrobe_items: {
    id: number
    item_name: string
    item_type: string
    color: string
  }
}

interface OutfitPreviewGridProps {
  items: OutfitItem[]
  maxItems?: number
  className?: string
}

export function OutfitPreviewGrid({ items, maxItems = 6, className = "" }: OutfitPreviewGridProps) {
  const displayItems = items.slice(0, maxItems)
  const remainingCount = items.length - maxItems

  // Предзагружаем изображения
  useEffect(() => {
    const itemNames = displayItems.map((item) => item.wardrobe_items.item_name)
    imageCache.preloadImages(itemNames)
  }, [displayItems])

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {displayItems.map((item) => (
        <div key={item.id} className="w-12 h-12 relative bg-gray-100 rounded-md overflow-hidden">
          <CachedWardrobeImage
            itemName={item.wardrobe_items.item_name}
            alt={item.wardrobe_items.item_name}
            sizes="48px"
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-md">
          <span className="text-xs text-gray-500">+{remainingCount}</span>
        </div>
      )}
    </div>
  )
}
