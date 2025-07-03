"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { WardrobeItem } from "@/lib/wardrobe"
import { Package } from "lucide-react"

interface WardrobeItemCardProps {
  item: WardrobeItem
  showImage?: boolean
  onSelect?: (item: WardrobeItem) => void
  isSelected?: boolean
}

export function WardrobeItemCard({ item, showImage = true, onSelect, isSelected = false }: WardrobeItemCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  const handleImageError = () => {
    setImageError(true)
    setImageLoading(false)
  }

  const handleImageLoad = () => {
    setImageLoading(false)
  }

  const handleClick = () => {
    if (onSelect) {
      onSelect(item)
    }
  }

  // Определяем источник изображения
  const getImageSrc = () => {
    if (item.image_url) {
      return item.image_url
    }
    if (item.basic_wardrobe_items?.image_url) {
      return item.basic_wardrobe_items.image_url
    }
    return null
  }

  const imageSrc = getImageSrc()

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-blue-500" : ""}`}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        {showImage && (
          <div className="aspect-square mb-3 bg-gray-100 rounded-lg overflow-hidden relative">
            {imageSrc && !imageError ? (
              <>
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Package className="h-8 w-8 text-gray-400 animate-pulse" />
                  </div>
                )}
                <Image
                  src={imageSrc || "/placeholder.svg"}
                  alt={item.item_name}
                  fill
                  className="object-cover"
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {item.material && (
              <Badge variant="secondary" className="text-xs">
                {item.material}
              </Badge>
            )}
            {item.color && (
              <Badge variant="outline" className="text-xs">
                {item.color}
              </Badge>
            )}
            {item.style && (
              <Badge variant="outline" className="text-xs">
                {item.style}
              </Badge>
            )}
          </div>

          {item.created_at && (
            <p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleDateString("ru-RU")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
