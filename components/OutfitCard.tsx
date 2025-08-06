'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import Image from 'next/image'
import { useToast } from '@/hooks/use-toast'

interface OutfitItem {
  id: number
  wardrobe_items: {
    id: number
    item_name: string
    image_url: string
    color: string
    clothing_type: string
  }
  position: number
}

interface Outfit {
  id: number
  name: string
  description?: string
  preview_image_url?: string
  created_at: string
  updated_at: string
  views_count: number
  likes: number
  outfit_items: OutfitItem[]
  is_public: boolean
}

interface OutfitCardProps {
  outfit: Outfit
  onEdit?: (outfit: Outfit) => void
  onDelete?: (outfitId: number) => void
  onView?: (outfit: Outfit) => void
  onRefresh?: () => void
  isAdmin?: boolean
}

export function OutfitCard({ outfit, onEdit, onDelete, onView, onRefresh, isAdmin = false }: OutfitCardProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  const handleView = async () => {
    onView?.(outfit)
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit?.(outfit)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm(`Вы уверены, что хотите удалить образ "${outfit.name}"?`)) {
      return
    }

    setIsUpdating(true)

    try {
      const response = await fetch(`/api/outfits/${outfit.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast({
          title: "Образ удален",
          description: `Образ "${outfit.name}" успешно удален`
        })
        onDelete?.(outfit.id)
        onRefresh?.()
      } else {
        throw new Error('Failed to delete outfit')
      }
    } catch (error) {
      console.error('Error deleting outfit:', error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить образ",
        variant: "destructive"
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg" onClick={handleView}>
      <CardContent className="p-4">
        <div className="relative aspect-square mb-3 bg-gray-100 rounded-lg overflow-hidden">
          {outfit.preview_image_url ? (
            <Image
              src={outfit.preview_image_url || "/placeholder.svg"}
              alt={outfit.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-200"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
          ) : outfit.outfit_items && outfit.outfit_items.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 h-full">
              {outfit.outfit_items.slice(0, 4).map((item, index) => (
                <div key={item.id} className="relative">
                  <Image
                    src={item.wardrobe_items.image_url || "/placeholder.svg"}
                    alt={item.wardrobe_items.item_name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 25vw, 12.5vw"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-gray-400 text-sm">Нет фото</span>
            </div>
          )}

          {/* Status badges */}
          <div className="absolute top-2 left-2 flex gap-1">
            {!outfit.is_public && (
              <Badge variant="secondary" className="text-xs">
                Приватный
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
          <h3 className="font-medium text-sm line-clamp-2 text-gray-900">
            {outfit.name}
          </h3>

          {outfit.description && (
            <p className="text-xs text-gray-500 line-clamp-2">
              {outfit.description}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                <span>{outfit.views_count || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>❤️ {outfit.likes || 0}</span>
              </div>
            </div>
            <span>{outfit.outfit_items?.length || 0} вещей</span>
          </div>

          {/* View button для админки */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={handleView}
            >
              Просмотр
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
