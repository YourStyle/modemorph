"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bookmark, Package, Heart } from "lucide-react"
import Image from "next/image"
import { ItemDetailsModal } from "./item-details-modal"
import { toast } from "sonner"

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

interface InspirationOutfitCardProps {
  id: string
  title: string
  description: string
  items: OutfitItem[]
  tags: string[]
  likes: number
  isLiked: boolean
  onLike?: (outfitId: string, action: "like" | "unlike") => void
  onSave?: (outfitId: string) => void
}

export function InspirationOutfitCard({
  id,
  title,
  description,
  items,
  tags,
  likes: initialLikes,
  isLiked: initialIsLiked,
  onLike,
  onSave,
}: InspirationOutfitCardProps) {
  const [selectedItem, setSelectedItem] = useState<OutfitItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  const [likes, setLikes] = useState(initialLikes)
  const [isLiked, setIsLiked] = useState(initialIsLiked)
  const [isLiking, setIsLiking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleImageError = (itemId: string) => {
    setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  }

  const handleItemClick = (item: OutfitItem) => {
    setSelectedItem(item)
  }

  const handleLike = async () => {
    if (isLiking) return
    setIsLiking(true)

    try {
      const action = isLiked ? "unlike" : "like"
      const response = await fetch("/api/outfits/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: id, action }),
      })

      if (response.ok) {
        const data = await response.json()
        setLikes(data.likes)
        setIsLiked(!isLiked)
        onLike?.(id, action)
      }
    } catch (error) {
      toast.error("Не удалось обновить лайк")
    } finally {
      setIsLiking(false)
    }
  }

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)

    try {
      const response = await fetch("/api/outfits/save-to-looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: id }),
      })

      if (response.ok) {
        toast.success("Образ сохранен в ваши образы!")
        onSave?.(id)
      } else {
        toast.error("Не удалось сохранить образ")
      }
    } catch (error) {
      toast.error("Не удалось сохранить образ")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card className="group overflow-hidden bg-white hover:shadow-lg transition-all duration-300">
        <CardContent className="p-0">
          {/* Outfit Grid - показываем все элементы */}
          <div className="aspect-square bg-gray-50 p-4">
            {items.length === 1 ? (
              // Один элемент - показываем на весь контейнер
              <div
                className="w-full h-full bg-white rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200"
                onClick={() => handleItemClick(items[0])}
              >
                {items[0].image_url && !imageErrors[items[0].id] ? (
                  <Image
                    src={items[0].image_url || "/placeholder.svg"}
                    alt={items[0].name}
                    fill
                    className="object-cover"
                    onError={() => handleImageError(items[0].id)}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Package className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
            ) : items.length === 2 ? (
              // Два элемента - показываем в ряд
              <div className="grid grid-cols-2 gap-2 h-full">
                {items.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="relative bg-white rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200"
                    onClick={() => handleItemClick(item)}
                  >
                    {item.image_url && !imageErrors[item.id] ? (
                      <Image
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.name}
                        fill
                        className="object-cover"
                        onError={() => handleImageError(item.id)}
                        sizes="(max-width: 768px) 50vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : items.length === 3 ? (
              // Три элемента - первый большой, два маленьких
              <div className="grid grid-cols-2 gap-2 h-full">
                <div
                  className="relative bg-white rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200"
                  onClick={() => handleItemClick(items[0])}
                >
                  {items[0].image_url && !imageErrors[items[0].id] ? (
                    <Image
                      src={items[0].image_url || "/placeholder.svg"}
                      alt={items[0].name}
                      fill
                      className="object-cover"
                      onError={() => handleImageError(items[0].id)}
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="grid grid-rows-2 gap-2">
                  {items.slice(1, 3).map((item, index) => (
                    <div
                      key={`${item.id}-${index + 1}`}
                      className="relative bg-white rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200"
                      onClick={() => handleItemClick(item)}
                    >
                      {item.image_url && !imageErrors[item.id] ? (
                        <Image
                          src={item.image_url || "/placeholder.svg"}
                          alt={item.name}
                          fill
                          className="object-cover"
                          onError={() => handleImageError(item.id)}
                          sizes="(max-width: 768px) 25vw, 12vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <Package className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Четыре или больше элементов - сетка 2x2
              <div className="grid grid-cols-2 gap-2 h-full relative">
                {items.slice(0, 4).map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="relative bg-white rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200"
                    onClick={() => handleItemClick(item)}
                  >
                    {item.image_url && !imageErrors[item.id] ? (
                      <Image
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.name}
                        fill
                        className="object-cover"
                        onError={() => handleImageError(item.id)}
                        sizes="(max-width: 768px) 50vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Show more items indicator */}
                {items.length > 4 && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    +{items.length - 4}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-gray-900 line-clamp-1">{title}</h3>
              <p className="text-sm text-gray-600 line-clamp-2 mt-1">{description}</p>
            </div>

            {/* Tags */}
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLike}
                  disabled={isLiking}
                  className={`p-1 h-auto ${isLiked ? "text-red-500" : "text-gray-500"}`}
                >
                  <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                  <span className="ml-1 text-sm">{likes}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="p-1 h-auto text-gray-500 hover:text-green-600"
                >
                  <Bookmark className="h-4 w-4" />
                  {isSaving && <span className="ml-1 text-xs">...</span>}
                </Button>
              </div>

              <Badge variant="outline" className="text-xs">
                {items.length} {items.length === 1 ? "элемент" : "элементов"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

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
            is_basic: selectedItem.is_basic || false,
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
