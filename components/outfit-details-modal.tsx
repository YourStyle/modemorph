"use client"

import type React from "react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Heart, Bookmark, BookmarkCheck, Loader2, Package } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { ItemDetailsModal } from "./item-details-modal"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  size_type?: string
  has_print?: string
  has_details?: string
  notes?: string
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
}

interface OutfitDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  outfit: {
    id: string
    title: string
    description: string
    items: OutfitItem[]
    tags: string[]
    likes: number
    isLiked: boolean
  }
  onLike: (e: React.MouseEvent) => void
  onSave: (e: React.MouseEvent) => void
  isLiking: boolean
  isSaving: boolean
  isSaved: boolean
}

export function OutfitDetailsModal({
  isOpen,
  onClose,
  outfit,
  onLike,
  onSave,
  isLiking,
  isSaving,
  isSaved,
}: OutfitDetailsModalProps) {
  const [selectedItem, setSelectedItem] = useState<OutfitItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})

  const handleImageError = (itemId: string) => {
    setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  }

  const handleItemClick = (item: OutfitItem) => {
    setSelectedItem(item)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">{outfit.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Description */}
            {outfit.description && <p className="text-gray-600">{outfit.description}</p>}

            {/* Tags */}
            {outfit.tags && outfit.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {outfit.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Items Grid */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Элементы образа ({outfit.items.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {outfit.items.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="group cursor-pointer bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-all duration-200"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="aspect-square relative">
                      {item.image_url && !imageErrors[item.id] ? (
                        <Image
                          src={item.image_url || "/placeholder.svg"}
                          alt={item.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={() => handleImageError(item.id)}
                          sizes="(max-width: 768px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <Package className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="font-medium text-sm line-clamp-2 mb-1">{item.name}</h4>
                      <div className="flex items-center gap-2">
                        {item.color && (
                          <div
                            className="w-3 h-3 rounded-full border border-gray-200"
                            style={{ backgroundColor: item.color.startsWith("#") ? item.color : `#${item.color}` }}
                          />
                        )}
                        <Badge variant="outline" className="text-xs">
                          {item.user_id ? "Ваше" : "Рекомендуем"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  onClick={onLike}
                  disabled={isLiking}
                  className={`transition-all duration-200 ${
                    outfit.isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-red-500"
                  }`}
                >
                  {isLiking ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Heart
                      className={`h-4 w-4 mr-2 transition-all duration-200 ${
                        outfit.isLiked ? "fill-current scale-110" : ""
                      }`}
                    />
                  )}
                  {outfit.likes} {outfit.likes === 1 ? "лайк" : "лайков"}
                </Button>

                <Button
                  variant="ghost"
                  onClick={onSave}
                  disabled={isSaving || isSaved}
                  className={`transition-all duration-200 ${
                    isSaved ? "text-green-600 hover:text-green-700" : "text-gray-500 hover:text-green-600"
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : isSaved ? (
                    <BookmarkCheck className="h-4 w-4 mr-2 fill-current" />
                  ) : (
                    <Bookmark className="h-4 w-4 mr-2" />
                  )}
                  {isSaving ? "Сохранение..." : isSaved ? "Сохранено" : "Сохранить"}
                </Button>
              </div>

              <Button variant="outline" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Details Modal */}
      {selectedItem && (
        <ItemDetailsModal
          item={{
            id: Number.parseInt(selectedItem.id),
            item_name: selectedItem.name,
            image_url: selectedItem.image_url,
            color: selectedItem.color,
            shade: selectedItem.shade,
            style: selectedItem.style,
            material: selectedItem.material,
            url: selectedItem.url,
            size_type: selectedItem.size_type,
            has_print: selectedItem.has_print,
            has_details: selectedItem.has_details,
            notes: selectedItem.notes,
            basic_item_id: selectedItem.basic_item_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            basic_material_id: null,
            is_hidden: false,
            user_id: selectedItem.user_id,
          }}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  )
}
