import React from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Edit, Trash2, Package } from 'lucide-react'
import { Outfit } from '@/types'

interface OutfitCardProps {
  outfit: Outfit
  onView?: (outfit: Outfit) => void
  onEdit?: (outfit: Outfit) => void
  onDelete?: (outfit: Outfit) => void
  showActions?: boolean
}

export function OutfitCard({ 
  outfit, 
  onView, 
  onEdit, 
  onDelete, 
  showActions = true 
}: OutfitCardProps) {
  const itemsCount = outfit.outfit_items?.length || outfit.items?.length || 0

  return (
    <Card className="group hover:shadow-lg transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{outfit.name}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              {itemsCount} {itemsCount === 1 ? 'элемент' : itemsCount < 5 ? 'элемента' : 'элементов'}
            </p>
          </div>
          <Badge variant="outline" className="ml-2">
            #{outfit.id}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Preview Image */}
        <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
          {outfit.preview_image_url ? (
            <Image
              src={outfit.preview_image_url || "/placeholder.svg"}
              alt={outfit.name}
              width={300}
              height={300}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-16 w-16 text-gray-400" />
              <div className="absolute bottom-2 left-2 right-2">
                <p className="text-xs text-gray-500 text-center">Нет превью</p>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {outfit.description && (
          <p className="text-sm text-gray-600 line-clamp-2">{outfit.description}</p>
        )}

        {/* Metadata */}
        <div className="text-xs text-gray-500">
          Создан {new Date(outfit.created_at).toLocaleDateString('ru-RU')}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2 pt-2">
            {onView && (
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 bg-transparent"
                onClick={() => onView(outfit)}
              >
                <Eye className="h-4 w-4 mr-2" />
                Просмотр
              </Button>
            )}
            {onEdit && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onEdit(outfit)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(outfit)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
