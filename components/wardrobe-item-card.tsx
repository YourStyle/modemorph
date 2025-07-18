"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Package, Eye, EyeOff, Trash2 } from "lucide-react"
import { ItemDetailsModal } from "./item-details-modal"
import type { WardrobeItem } from "./item-details-modal"

interface WardrobeItemCardProps {
  item: WardrobeItem
  onToggleVisibility?: (id: number, isHidden: boolean) => void
  onDelete?: (id: number) => void
  showActions?: boolean
  isSelected?: boolean
  onSelect?: (item: WardrobeItem) => void
}

export function WardrobeItemCard({
  item,
  onToggleVisibility,
  onDelete,
  showActions = false,
  isSelected = false,
  onSelect,
}: WardrobeItemCardProps) {
  const [imageError, setImageError] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(item)
    } else {
      setShowModal(true)
    }
  }

  const handleToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onToggleVisibility) {
      onToggleVisibility(item.id, !item.is_hidden)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete) {
      onDelete(item.id)
    }
  }

  const imageUrl = item.image_url || item.basic_wardrobe_items?.image_url
  const itemName = item.item_name || item.basic_wardrobe_items?.name_ru || "Без названия"

  return (
    <>
      <Card
        className={`group cursor-pointer transition-all duration-200 hover:shadow-md ${
          isSelected ? "ring-2 ring-blue-500 shadow-md" : ""
        } ${item.is_hidden ? "opacity-60" : ""}`}
        onClick={handleCardClick}
      >
        <CardContent className="p-3">
          {/* Image */}
          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3 relative">
            {imageUrl && !imageError ? (
              <Image
                src={imageUrl || "/placeholder.svg"}
                alt={itemName}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-200"
                onError={handleImageError}
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
            )}

            {/* Actions overlay */}
            {showActions && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
                  onClick={handleToggleVisibility}
                >
                  {item.is_hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 w-8 p-0 bg-red-500/90 hover:bg-red-500"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Status badges */}
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {item.is_basic && <Badge className="bg-green-500 text-white text-xs">Базовая</Badge>}
              {item.user_id && <Badge className="bg-blue-500 text-white text-xs">Ваша</Badge>}
              {item.is_hidden && (
                <Badge variant="secondary" className="text-xs">
                  Скрыта
                </Badge>
              )}
            </div>
          </div>

          {/* Item info */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{itemName}</h3>

            <div className="flex flex-wrap gap-1">
              {item.color && (
                <Badge variant="secondary" className="text-xs">
                  {item.color}
                </Badge>
              )}
              {item.material && (
                <Badge variant="outline" className="text-xs">
                  {item.material}
                </Badge>
              )}
            </div>

            {item.style && <p className="text-xs text-gray-600 line-clamp-1">{item.style}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Item Details Modal */}
      <ItemDetailsModal item={item} isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  )
}
