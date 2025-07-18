"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Package } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

interface WardrobeItem {
  id: number
  item_name: string
  image_url: string | null
  color: string | null
  shade: string | null
  style: string | null
  material: string | null
  url: string | null
  size_type: string | null
  has_print: string | null
  has_details: string | null
  notes: string | null
  is_basic: boolean
  basic_item_id: number | null
  created_at: string
  updated_at: string
  basic_material_id: number | null
  is_hidden: boolean
  user_id: string | null
}

interface ItemDetailsModalProps {
  item: WardrobeItem
  isOpen: boolean
  onClose: () => void
}

export function ItemDetailsModal({ item, isOpen, onClose }: ItemDetailsModalProps) {
  const [imageError, setImageError] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{item.item_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image */}
          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
            {item.image_url && !imageError ? (
              <Image
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                width={400}
                height={400}
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-12 w-12 text-gray-400" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            {item.color && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Цвет:</span>
                <Badge variant="secondary">{item.color}</Badge>
                {item.shade && <Badge variant="outline">{item.shade}</Badge>}
              </div>
            )}

            {item.style && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Стиль:</span>
                <Badge variant="secondary">{item.style}</Badge>
              </div>
            )}

            {item.material && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Материал:</span>
                <Badge variant="secondary">{item.material}</Badge>
              </div>
            )}

            {item.size_type && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Размер:</span>
                <Badge variant="secondary">{item.size_type}</Badge>
              </div>
            )}

            {item.has_print && item.has_print !== "no" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Принт:</span>
                <Badge variant="secondary">{item.has_print}</Badge>
              </div>
            )}

            {item.has_details && item.has_details !== "no" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Детали:</span>
                <Badge variant="secondary">{item.has_details}</Badge>
              </div>
            )}

            {item.notes && (
              <div>
                <span className="text-sm font-medium text-gray-700">Заметки:</span>
                <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
              </div>
            )}

            {item.is_basic && (
              <Badge variant="outline" className="w-fit">
                Базовая вещь
              </Badge>
            )}
          </div>

          {/* Actions */}
          {item.url && (
            <Button asChild className="w-full">
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />В магазин
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
