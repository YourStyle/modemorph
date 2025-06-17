"use client"

import type React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Package, Shirt, Check, Star, Eye, EyeOff } from "lucide-react"
import type { WardrobeItem } from "@/lib/wardrobe"
import Image from "next/image"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { cn } from "@/lib/utils"
import { ColorDisplay } from "@/components/color-display"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

interface WardrobeItemCardProps {
  item: WardrobeItem
  isAdmin?: boolean
  onVisibilityChange?: () => void
}

export function WardrobeItemCard({ item, isAdmin = false, onVisibilityChange }: WardrobeItemCardProps) {
  const { isSelected, toggleItem } = useSelectedItems()
  const selected = isSelected(item.id)
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  // Проверяем, есть ли поле is_basic в объекте item
  const hasBasicField = "is_basic" in item
  const isHidden = item.is_hidden || false

  // Получаем тип из связанной базовой вещи
  const getItemType = () => {
    if (item.basic_wardrobe_items) {
      return item.basic_wardrobe_items.name_ru
    }
    return "Не указан тип"
  }

  const handleVisibilityToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsUpdating(true)

    try {
      const response = await fetch("/api/wardrobe/visibility", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: item.id,
          isHidden: !isHidden,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update visibility")
      }

      toast({
        title: isHidden ? "Вещь показана" : "Вещь скрыта",
        description: isHidden ? "Вещь теперь видна в гардеробе" : "Вещь скрыта из гардероба",
      })

      onVisibilityChange?.()
    } catch (error) {
      console.error("Error updating visibility:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось изменить видимость вещи",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card
      className={cn(
        "group hover:shadow-lg transition-all duration-200 cursor-pointer relative",
        selected && "ring-2 ring-blue-500 shadow-md",
        hasBasicField && item.is_basic && "border-yellow-300",
        isHidden && isAdmin && "opacity-60 border-gray-300",
      )}
      onClick={() => !isHidden && toggleItem(item)}
    >
      <CardContent className="p-4 relative">
        {/* Кнопка видимости для админа */}
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute top-2 left-2 z-10 p-1 h-8 w-8",
              isHidden ? "bg-red-100 hover:bg-red-200" : "bg-green-100 hover:bg-green-200",
            )}
            onClick={handleVisibilityToggle}
            disabled={isUpdating}
          >
            {isHidden ? <EyeOff className="h-4 w-4 text-red-600" /> : <Eye className="h-4 w-4 text-green-600" />}
          </Button>
        )}

        {/* Индикатор выбора */}
        {selected && !isHidden && (
          <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white rounded-full p-1">
            <Check className="h-4 w-4" />
          </div>
        )}

        {/* Индикатор базовой вещи */}
        {hasBasicField && item.is_basic && (
          <div
            className={cn(
              "absolute top-2 z-10 bg-yellow-400 text-white rounded-full p-1",
              isAdmin ? "right-2" : "left-2",
            )}
          >
            <Star className="h-4 w-4" />
          </div>
        )}

        {/* Индикатор скрытой вещи */}
        {isHidden && (
          <div className="absolute inset-0 bg-gray-900/20 rounded-lg flex items-center justify-center z-5">
            <div className="bg-white/90 px-3 py-1 rounded-full text-sm font-medium text-gray-600">Скрыто</div>
          </div>
        )}

        {/* Изображение */}
        <div className="relative aspect-square mb-4 bg-gray-100 rounded-lg overflow-hidden">
          {item.image_url ? (
            <Image
              src={item.image_url || "/placeholder.svg"}
              alt={item.item_name}
              fill
              className={cn(
                "object-cover group-hover:scale-105 transition-transform duration-200",
                selected && "opacity-90",
                isHidden && "grayscale",
              )}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Package className="h-12 w-12" />
            </div>
          )}
        </div>

        {/* Информация о вещи */}
        <div className="space-y-3">
          <div>
            <h3 className={cn("font-semibold text-lg line-clamp-2 mb-1", isHidden && "text-gray-500")}>
              {item.item_name.replace(/_/g, " ").replace(/-/g, " ")}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shirt className="h-4 w-4" />
              <span>{getItemType()}</span>
            </div>
          </div>

          {/* Бейджи */}
          <div className="flex flex-wrap gap-2">
            {hasBasicField && item.is_basic && (
              <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                <Star className="h-3 w-3 mr-1" />
                Базовая вещь
              </Badge>
            )}
            {item.color && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <ColorDisplay color={item.color} size="xs" />
                {item.color.startsWith("#") ? "Цвет" : item.color.replace(/_/g, " ").replace(/-/g, " ")}
              </Badge>
            )}
            {item.material && item.material !== "nan" && (
              <Badge variant="outline" className="text-xs">
                {item.material}
              </Badge>
            )}
            {item.size_type && item.size_type !== "nan" && (
              <Badge variant="outline" className="text-xs">
                {item.size_type}
              </Badge>
            )}
          </div>

          {/* Дополнительная информация */}
          <div className="space-y-1 text-sm text-gray-600">
            {item.style && item.style !== "nan" && (
              <div>
                <span className="font-medium">Стиль:</span> {item.style}
              </div>
            )}
            {item.shade && item.shade !== "nan" && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Оттенок:</span>
                {item.shade.startsWith("#") ? <ColorDisplay color={item.shade} size="xs" /> : <span>{item.shade}</span>}
              </div>
            )}
            <div className="flex items-center gap-4">
              {item.has_print === "Y" && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">С принтом</span>
              )}
              {item.has_details === "Y" && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">С деталями</span>
              )}
            </div>
          </div>

          {/* Примечания */}
          {item.notes && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Примечания:</span> {item.notes}
            </div>
          )}

          {/* Ссылка на товар */}
          {item.url && item.url !== "nan" && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              onClick={(e) => e.stopPropagation()} // Предотвращаем выбор элемента при клике на ссылку
            >
              <ExternalLink className="h-4 w-4" />
              Посмотреть товар
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
