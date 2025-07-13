"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { WardrobeItem } from "@/lib/wardrobe"
import { Package, Eye, EyeOff, Trash2, Loader2 } from "lucide-react"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { useToast } from "@/hooks/use-toast"

interface WardrobeItemCardProps {
  item: WardrobeItem
  showImage?: boolean
  onSelect?: (item: WardrobeItem) => void
  isSelected?: boolean
  isAdmin?: boolean
  onVisibilityChange?: (itemId: number, isHidden: boolean) => void
}

export function WardrobeItemCard({
  item,
  showImage = true,
  onSelect,
  isSelected = false,
  isAdmin = false,
  onVisibilityChange,
}: WardrobeItemCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { addItem, removeItem, selectedItems } = useSelectedItems()
  const { toast } = useToast()

  const handleImageError = () => {
    setImageError(true)
    setImageLoading(false)
  }

  const handleImageLoad = () => {
    setImageLoading(false)
  }

  const handleClick = (e: React.MouseEvent) => {
    // Предотвращаем выбор при клике на кнопки
    if ((e.target as HTMLElement).closest("button")) {
      return
    }

    if (onSelect) {
      onSelect(item)
    } else {
      // Логика для выбора элементов в контексте
      const isCurrentlySelected = selectedItems.some((selectedItem) => selectedItem.id === item.id)
      if (isCurrentlySelected) {
        removeItem(item.id)
      } else {
        addItem(item)
      }
    }
  }

  const handleToggleVisibility = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsUpdatingVisibility(true)

    try {
      const response = await fetch(`/api/wardrobe/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_hidden: !item.is_hidden,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update visibility")
      }

      // Обновляем локальное состояние через callback
      if (onVisibilityChange) {
        onVisibilityChange(item.id, !item.is_hidden)
      }

      toast({
        title: item.is_hidden ? "Вещь показана" : "Вещь скрыта",
        description: item.is_hidden ? "Вещь теперь видна в публичном просмотре" : "Вещь скрыта из публичного просмотра",
      })
    } catch (error) {
      console.error("Error updating visibility:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось изменить видимость вещи",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/wardrobe/${item.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete item")
      }

      toast({
        title: "Вещь удалена",
        description: "Элемент гардероба успешно удален",
      })

      // Перезагружаем страницу или обновляем список
      window.location.reload()
    } catch (error) {
      console.error("Error deleting item:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить вещь",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
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
  const isCurrentlySelected = selectedItems.some((selectedItem) => selectedItem.id === item.id)
  const cardSelected = isSelected || isCurrentlySelected

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md relative group ${
        cardSelected ? "ring-2 ring-blue-500" : ""
      } ${item.is_hidden ? "opacity-60" : ""}`}
      onClick={handleClick}
    >
      {/* Admin controls */}
      {isAdmin && (
        <div className="absolute top-2 right-2 z-10 flex gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleToggleVisibility}
            disabled={isUpdatingVisibility}
            className="h-8 w-8 p-0"
          >
            {isUpdatingVisibility ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : item.is_hidden ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={isDeleting} className="h-8 w-8 p-0">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить вещь?</AlertDialogTitle>
                <AlertDialogDescription>
                  Это действие нельзя отменить. Вещь "{item.item_name}" будет удалена навсегда.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

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
          <h3 className="font-medium text-gray-900 truncate">{item.item_name}</h3>

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

          {item.is_hidden && (
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <EyeOff className="h-3 w-3" />
              <span>Скрыто</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
