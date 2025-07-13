"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, Trash2, Loader2 } from "lucide-react"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { useToast } from "@/hooks/use-toast"
import { CachedWardrobeImage } from "./cached-wardrobe-image"
import type { WardrobeItem } from "@/lib/wardrobe"
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

interface WardrobeItemCardProps {
  item: WardrobeItem
  isAdmin?: boolean
  onVisibilityChange?: (itemId: number, isHidden: boolean) => void
}

export function WardrobeItemCard({ item, isAdmin = false, onVisibilityChange }: WardrobeItemCardProps) {
  const { selectedItems, addItem, removeItem } = useSelectedItems()
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  const isSelected = selectedItems.some((selectedItem) => selectedItem.id === item.id)

  const handleCardClick = () => {
    if (isSelected) {
      removeItem(item.id)
    } else {
      addItem(item)
    }
  }

  const handleVisibilityToggle = async (e: React.MouseEvent) => {
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

      onVisibilityChange?.(item.id, !item.is_hidden)

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
        description: "Вещь успешно удалена из гардероба",
      })

      // Перезагружаем страницу для обновления списка
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

  return (
    <Card
      className={`group cursor-pointer transition-all duration-200 hover:shadow-lg relative ${
        isSelected ? "ring-2 ring-blue-500 shadow-lg" : ""
      } ${item.is_hidden ? "opacity-60" : ""}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="relative">
          <div className="aspect-square mb-3 bg-gray-100 rounded-lg overflow-hidden">
            <CachedWardrobeImage
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          </div>

          {/* Админские кнопки - всегда видны с белой подложкой */}
          {isAdmin && (
            <div className="absolute top-2 right-2 flex flex-col gap-1 bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleVisibilityToggle}
                disabled={isUpdatingVisibility}
                className="h-8 w-8 p-0 hover:bg-gray-100"
              >
                {isUpdatingVisibility ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : item.is_hidden ? (
                  <EyeOff className="h-4 w-4 text-gray-600" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-600" />
                )}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDeleting}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-gray-600" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить вещь?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие нельзя отменить. Вещь "{item.name}" будет удалена из гардероба навсегда.
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

          {item.is_hidden && (
            <div className="absolute top-2 left-2">
              <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                Скрыто
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-gray-900 line-clamp-2">{item.name}</h3>

          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              {item.clothing_types?.name || "Без типа"}
            </Badge>
            {item.color && (
              <Badge variant="outline" className="text-xs">
                {item.color}
              </Badge>
            )}
          </div>

          {item.description && <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{item.brand || "Без бренда"}</span>
            {item.price && <span>{item.price} ₽</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
