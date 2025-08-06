'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Edit, Trash2, Check } from 'lucide-react'
import { OptimizedImage } from './optimized-image'

interface WardrobeItem {
  id: string
  name: string
  image_url: string
  color: string
  clothing_type: string
  is_basic: boolean
  is_hidden: boolean
  created_at: string
}

interface WardrobeItemCardProps {
  item: WardrobeItem
  isSelected?: boolean
  isEditMode?: boolean
  onItemClick?: () => void
  onToggleVisibility?: () => void
  onDelete?: () => void
}

export function WardrobeItemCard({
  item,
  isSelected = false,
  isEditMode = false,
  onItemClick,
  onToggleVisibility,
  onDelete
}: WardrobeItemCardProps) {
  const [imageError, setImageError] = useState(false)

  const handleCardClick = () => {
    if (isEditMode && onItemClick) {
      onItemClick()
    }
  }

  return (
    <Card 
      className={`relative overflow-hidden transition-all duration-200 hover:shadow-md ${
        isEditMode ? 'cursor-pointer' : ''
      } ${
        isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      } ${
        item.is_hidden ? 'opacity-60' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Индикатор выбора */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white rounded-full p-1">
          <Check className="h-4 w-4" />
        </div>
      )}

      {/* Бейджи */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        {item.is_basic && (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
            Базовая
          </Badge>
        )}
        {item.is_hidden && (
          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
            Скрыта
          </Badge>
        )}
      </div>

      {/* Изображение */}
      <div className="aspect-square relative bg-gray-100">
        {!imageError ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <span className="text-gray-400 text-sm">Нет изображения</span>
          </div>
        )}
      </div>

      <CardContent className="p-3">
        <div className="space-y-2">
          <h3 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">
            {item.name}
          </h3>
          
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              {item.clothing_type}
            </Badge>
            <Badge 
              variant="outline" 
              className="text-xs"
              style={{ backgroundColor: item.color + '20', borderColor: item.color }}
            >
              {item.color}
            </Badge>
          </div>

          {/* Кнопки управления (только если не в режиме редактирования) */}
          {!isEditMode && (
            <div className="flex justify-between items-center pt-2">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility?.()
                  }}
                  className="h-8 w-8 p-0"
                >
                  {item.is_hidden ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.()
                }}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
