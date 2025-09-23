"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bookmark, Package, Heart, BookmarkCheck, Loader2 } from "lucide-react"
import Image from "next/image"
import { ItemDetailsModal } from "./item-details-modal"
import { OutfitDetailsModal } from "./outfit-details-modal"
import { toast } from "sonner"
import {api} from "@/lib/api-client";

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
  isSaved?: boolean
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
  isSaved: initialIsSaved = false,
  onLike,
  onSave,
}: InspirationOutfitCardProps) {
  const [selectedItem, setSelectedItem] = useState<OutfitItem | null>(null)
  const [showOutfitDetails, setShowOutfitDetails] = useState(false)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  const [likes, setLikes] = useState(initialLikes || 0)
  const [isLiked, setIsLiked] = useState(initialIsLiked || false)
  const [isLiking, setIsLiking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(initialIsSaved)

  const handleImageError = (itemId: string) => {
    setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  }

  const handleItemClick = (item: OutfitItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedItem(item)
  }

  const handleOutfitClick = () => {
    setShowOutfitDetails(true)
  }

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLiking) return

    setIsLiking(true)

    try {
      const action = isLiked ? "unlike" : "like"
      const data = await api.post("/api/outfits/like", { outfitId: id, action })
      setLikes(data.likes || (isLiked ? likes - 1 : likes + 1))
      setIsLiked(!isLiked)
      toast.success(isLiked ? "Лайк убран" : "Лайк поставлен", {
        duration: 1500,
      })
    } catch (error) {
      toast.error("Не удалось обновить лайк")
    } finally {
      setIsLiking(false)
    }
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isSaving || isSaved) return

    setIsSaving(true)

    try {
      const response = await api.post("/api/outfits/save-to-looks", { outfitId: id })

      if (response.ok) {
        setIsSaved(true)
        toast.success("Образ сохранен в ваши образы!", {
          duration: 2000,
        })
        onSave?.(id)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save outfit")
      }
    } catch (error) {
      console.error("Save error:", error)
      toast.error("Не удалось сохранить образ")
    } finally {
      setIsSaving(false)
    }
  }

  // Безопасная проверка данных
  const safeItems = items || []
  const safeTags = tags || []

  return (
    <>
      <Card
        className="group overflow-hidden bg-white hover:shadow-lg transition-all duration-300 cursor-pointer"
        onClick={handleOutfitClick}
      >
        <CardContent className="p-0">
          {/* Outfit Grid - показываем все элементы */}
          <div className="aspect-square bg-gray-50 p-4">
            {safeItems.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
                <Package className="h-8 w-8 text-gray-400" />
                <span className="ml-2 text-gray-500">Нет элементов</span>
              </div>
            ) : safeItems.length === 1 ? (
              // Один элемент - показываем на весь контейнер
              <div
                className="w-full h-full bg-white rounded-lg overflow-hidden hover:scale-105 transition-transform duration-200 relative"
                onClick={(e) => handleItemClick(safeItems[0], e)}
              >
                {safeItems[0].image_url && !imageErrors[safeItems[0].id] ? (
                  <Image
                    src={safeItems[0].image_url || "/placeholder.svg"}
                    alt={safeItems[0].name}
                    fill
                    className="object-cover"
                    onError={() => handleImageError(safeItems[0].id)}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Package className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
            ) : safeItems.length === 2 ? (
              // Два элемента - показываем в ряд
              <div className="grid grid-cols-2 gap-2 h-full">
                {safeItems.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="relative bg-white rounded-lg overflow-hidden hover:scale-105 transition-transform duration-200"
                    onClick={(e) => handleItemClick(item, e)}
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
            ) : safeItems.length === 3 ? (
              // Три элемента - первый большой, два маленьких
              <div className="grid grid-cols-2 gap-2 h-full">
                <div
                  className="relative bg-white rounded-lg overflow-hidden hover:scale-105 transition-transform duration-200"
                  onClick={(e) => handleItemClick(safeItems[0], e)}
                >
                  {safeItems[0].image_url && !imageErrors[safeItems[0].id] ? (
                    <Image
                      src={safeItems[0].image_url || "/placeholder.svg"}
                      alt={safeItems[0].name}
                      fill
                      className="object-cover"
                      onError={() => handleImageError(safeItems[0].id)}
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="grid grid-rows-2 gap-2">
                  {safeItems.slice(1, 3).map((item, index) => (
                    <div
                      key={`${item.id}-${index + 1}`}
                      className="relative bg-white rounded-lg overflow-hidden hover:scale-105 transition-transform duration-200"
                      onClick={(e) => handleItemClick(item, e)}
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
                {safeItems.slice(0, 4).map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="relative bg-white rounded-lg overflow-hidden hover:scale-105 transition-transform duration-200"
                    onClick={(e) => handleItemClick(item, e)}
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
                {safeItems.length > 4 && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    +{safeItems.length - 4}
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
            {safeTags && safeTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {safeTags.slice(0, 3).map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {safeTags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{safeTags.length - 3}
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
                  className={`p-1 h-auto transition-all duration-200 ${
                    isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-red-500"
                  }`}
                >
                  {isLiking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Heart
                      className={`h-4 w-4 transition-all duration-200 ${isLiked ? "fill-current scale-110" : ""}`}
                    />
                  )}
                  <span className="ml-1 text-sm font-medium">{likes}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || isSaved}
                  className={`p-1 h-auto transition-all duration-200 ${
                    isSaved ? "text-green-600 hover:text-green-700" : "text-gray-500 hover:text-green-600"
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isSaved ? (
                    <BookmarkCheck className="h-4 w-4 fill-current" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  {isSaving && <span className="ml-1 text-xs">Сохранение...</span>}
                  {isSaved && <span className="ml-1 text-xs">Сохранено</span>}
                </Button>
              </div>

              <Badge variant="outline" className="text-xs">
                {safeItems.length} {safeItems.length === 1 ? "элемент" : "элементов"}
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

      {/* Outfit Details Modal */}
      <OutfitDetailsModal
        isOpen={showOutfitDetails}
        onClose={() => setShowOutfitDetails(false)}
        outfit={{
          id,
          title,
          description,
          items: safeItems,
          tags: safeTags,
          likes,
          isLiked,
        }}
        onLike={handleLike}
        onSave={handleSave}
        isLiking={isLiking}
        isSaving={isSaving}
        isSaved={isSaved}
      />
    </>
  )
}
