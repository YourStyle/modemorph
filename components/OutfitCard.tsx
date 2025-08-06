'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Heart, Eye, Edit, Trash2, MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { deleteOutfit, incrementViewCount } from '@/lib/api/outfits'

interface OutfitCardProps {
  outfit: {
    id: number
    name: string
    description?: string
    season?: string
    occasion?: string
    preview_image_url: string
    likes: number
    views_count: number
    favorites_count: number
    created_at: string
    outfit_items?: Array<{
      wardrobe_items: {
        id: number
        item_name: string
        image_url?: string
        clothing_type?: string
        color?: string
      }
    }>
  }
  onEdit?: (outfit: any) => void
  onDelete?: (outfitId: number) => void
  onView?: (outfit: any) => void
}

export function OutfitCard({ outfit, onEdit, onDelete, onView }: OutfitCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleView = async () => {
    try {
      await incrementViewCount(outfit.id)
      onView?.(outfit)
    } catch (error) {
      console.error('Error incrementing view count:', error)
      onView?.(outfit)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteOutfit(outfit.id)
      toast.success('Образ удален')
      onDelete?.(outfit.id)
    } catch (error) {
      console.error('Error deleting outfit:', error)
      toast.error('Ошибка при удалении образа')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <img
          src={outfit.preview_image_url || "/placeholder.svg"}
          alt={outfit.name}
          className="w-full h-48 object-cover cursor-pointer"
          onClick={handleView}
        />
        
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(outfit)}>
                <Edit className="mr-2 h-4 w-4" />
                Редактировать
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Удалить
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить образ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие нельзя отменить. Образ "{outfit.name}" будет удален навсегда.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? 'Удаление...' : 'Удалить'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Статистика */}
        <div className="absolute bottom-2 left-2 flex gap-2">
          <Badge variant="secondary" className="text-xs">
            <Eye className="mr-1 h-3 w-3" />
            {outfit.views_count || 0}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Heart className="mr-1 h-3 w-3" />
            {outfit.likes || 0}
          </Badge>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg line-clamp-1">{outfit.name}</h3>
          
          {outfit.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {outfit.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {outfit.season && (
              <Badge variant="outline" className="text-xs">
                {outfit.season}
              </Badge>
            )}
            {outfit.occasion && (
              <Badge variant="outline" className="text-xs">
                {outfit.occasion}
              </Badge>
            )}
          </div>

          {outfit.outfit_items && outfit.outfit_items.length > 0 && (
            <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
              <span>Вещи: </span>
              {outfit.outfit_items.slice(0, 3).map((item, index) => (
                <span key={index}>
                  {item.wardrobe_items.item_name}
                  {index < Math.min(outfit.outfit_items!.length, 3) - 1 && ', '}
                </span>
              ))}
              {outfit.outfit_items.length > 3 && (
                <span>и еще {outfit.outfit_items.length - 3}</span>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-muted-foreground">
              {formatDate(outfit.created_at)}
            </span>
            <Button variant="outline" size="sm" onClick={handleView}>
              Просмотр
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
