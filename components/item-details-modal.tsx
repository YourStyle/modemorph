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
  image_url?: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  size_type?: string
  has_print?: string
  has_details?: string
  notes?: string
  basic_item_id?: number | null
  created_at: string
  updated_at: string
  basic_material_id?: number | null
  is_hidden?: boolean
  user_id?: string | null
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

  const getColorDisplay = (color?: string, shade?: string) => {
    if (!color) return null

    const colorValue = color.startsWith("#") ? color : `#${color}`

    return (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: colorValue }} />
        <span className="text-sm font-medium">{colorValue}</span>
        {shade && <span className="text-sm text-gray-600">{shade}</span>}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{item.item_name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Image */}
          <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
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
                <Package className="h-16 w-16 text-gray-400" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Основная информация</h3>
              <div className="space-y-3">
                {item.size_type && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Размер:</span>
                    <p className="text-sm text-gray-900">{item.size_type}</p>
                  </div>
                )}

                {item.material && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Материал:</span>
                    <p className="text-sm text-gray-900">{item.material}</p>
                  </div>
                )}

                {item.style && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Стиль:</span>
                    <p className="text-sm text-gray-900">{item.style}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Color */}
            {item.color && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Цвет</h3>
                {getColorDisplay(item.color, item.shade)}
              </div>
            )}

            {/* Characteristics */}
            {(item.has_print || item.has_details) && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Характеристики</h3>
                <div className="flex flex-wrap gap-2">
                  {item.has_print && item.has_print !== "нет" && (
                    <Badge variant="secondary">Принт: {item.has_print}</Badge>
                  )}
                  {item.has_details && item.has_details !== "нет" && (
                    <Badge variant="secondary">Детали: {item.has_details}</Badge>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {item.notes && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Заметки</h3>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{item.notes}</p>
              </div>
            )}

            {/* External Link */}
            {item.url && (
              <div>
                <Button asChild variant="outline" className="w-full bg-transparent">
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Посмотреть в магазине
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
