"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MoreVertical, Eye, EyeOff, Trash2, Edit, Check } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Image from "next/image"
import { ItemDetailsModal, type WardrobeItem } from "./item-details-modal"
import { EditWardrobeItemSheet } from "./edit-wardrobe-item-sheet"
import { useToast } from "@/hooks/use-toast"

interface WardrobeItemCardProps {
  item: WardrobeItem
  onRefresh?: () => void
  isAdmin?: boolean
  isSelected?: boolean
  onSelect?: (item: WardrobeItem) => void
  onVisibilityChange?: (itemId: number, isHidden: boolean) => void
  onDelete?: (itemId: number) => void
}

export function WardrobeItemCard({ 
  item, 
  onRefresh, 
  isAdmin = true, 
  isSelected = false, 
  onSelect,
  onVisibilityChange,
  onDelete 
}: WardrobeItemCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(item)
    } else if (isAdmin) {
      setShowDetails(true)
    }
  }

  const handleToggleVisibility = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsUpdating(true)

    try {
      const response = await fetch(`/api/wardrobe/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...item,
          is_hidden: !item.is_hidden,
        }),
      })

      if (response.ok) {
        toast({
          title: item.is_hidden ? "Вещь показана" : "Вещь скрыта",
          description: `Вещь "${item.item_name}" ${item.is_hidden ? "теперь видна" : "скрыта"} в гардеробе`,
        })
        onVisibilityChange?.(item.id, !item.is_hidden)
        onRefresh?.()
      } else {
        throw new Error("Failed to update visibility")
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось изменить видимость вещи",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm(`Вы уверены, что хотите удалить "${item.item_name}"?`)) {
      return
    }

    setIsUpdating(true)

    try {
      const response = await fetch(`/api/wardrobe/${item.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Вещь удалена",
          description: `Вещь "${item.item_name}" успешно удалена из гардероба`,
        })
        onDelete?.(item.id)
        onRefresh?.()
      } else {
        throw new Error("Failed to delete item")
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить вещь",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowEditSheet(true)
  }

  return (
    <>
      <Card 
        className={`group cursor-pointer transition-all duration-200 ${
          isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'
        } ${
          item.is_hidden ? 'opacity-60 bg-gray-50 border-dashed border-gray-300' : 'bg-white'
        }`} 
        onClick={handleCardClick}
      >
        <CardContent className="p-4">
          <div className="relative aspect-square mb-3 bg-gray-100 rounded-lg overflow-hidden">
            {item.image_url ? (
              <div className="relative w-full h-full">
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.item_name || "Вещь"}
                  fill
                  className={`object-cover group-hover:scale-105 transition-transform duration-200 ${
                    item.is_hidden ? 'grayscale opacity-75' : ''
                  }`}
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
                {item.is_hidden && (
                  <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
                    <EyeOff className="w-8 h-8 text-white opacity-80" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-400 text-sm">Нет фото</span>
              </div>
            )}

            {/* Status indicators */}
            <div className="absolute top-2 left-2 flex gap-1">
              {item.is_hidden && (
                <Badge variant="destructive" className="text-xs">
                  <EyeOff className="w-3 h-3 mr-1" />
                  Скрыто
                </Badge>
              )}
              {isSelected && (
                <Badge className="text-xs bg-blue-500">
                  <Check className="h-3 w-3 mr-1" />
                  Выбрано
                </Badge>
              )}
              {item.is_basic && (
                <Badge variant="secondary" className="text-xs">
                  Базовая
                </Badge>
              )}
            </div>

            {/* Actions menu - только в админ режиме */}
            {isAdmin && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleToggleVisibility} disabled={isUpdating}>
                      {item.is_hidden ? (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Показать
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Скрыть
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} disabled={isUpdating} className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className={`font-medium text-sm line-clamp-2 ${
              item.is_hidden ? 'text-gray-500' : 'text-gray-900'
            }`}>
              {item.item_name || item.basic_wardrobe_items?.name_ru || "Без названия"}
            </h3>

            <div className="flex items-center gap-2">
              {item.color && (
                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full border border-gray-300"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className={`text-xs ${item.is_hidden ? 'text-gray-400' : 'text-gray-500'}`}>
                    {item.color}
                  </span>
                </div>
              )}
              {item.size_type && (
                <span className={`text-xs ${item.is_hidden ? 'text-gray-400' : 'text-gray-500'}`}>
                  {item.size_type}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {(item.has_print === true || item.has_print === "true") && (
                <Badge variant="outline" className="text-xs">
                  Принт
                </Badge>
              )}
              {(item.has_details === true || item.has_details === "true") && (
                <Badge variant="outline" className="text-xs">
                  Детали
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <ItemDetailsModal item={item} isOpen={showDetails} onClose={() => setShowDetails(false)} onRefresh={onRefresh} />
          <EditWardrobeItemSheet
            item={item}
            isOpen={showEditSheet}
            onClose={() => setShowEditSheet(false)}
            onSuccess={onRefresh}
          />
        </>
      )}
    </>
  )
}
