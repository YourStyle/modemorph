'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Eye } from 'lucide-react'

interface WardrobeItem {
  id: string
  name: string
  image_url: string
  clothing_type: string
  color: string
  is_basic: boolean
}

interface ItemCardProps {
  item: WardrobeItem
  isSelected?: boolean
  isEditMode?: boolean
  onSelect?: (item: WardrobeItem) => void
  onView?: (item: WardrobeItem) => void
}

export default function ItemCard({ 
  item, 
  isSelected = false, 
  isEditMode = false,
  onSelect,
  onView 
}: ItemCardProps) {
  const [imageError, setImageError] = useState(false)

  const handleClick = () => {
    if (isEditMode && onSelect) {
      onSelect(item)
    } else if (onView) {
      onView(item)
    }
  }

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={handleClick}
    >
      <CardContent className="p-3">
        <div className="aspect-square relative mb-2">
          {!imageError ? (
            <Image
              src={item.image_url || "/placeholder.svg"}
              alt={item.name}
              fill
              className="object-cover rounded-md"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gray-200 rounded-md flex items-center justify-center">
              <span className="text-gray-400 text-sm">Нет изображения</span>
            </div>
          )}
          
          {isEditMode && (
            <div className="absolute top-2 right-2">
              <Button size="sm" variant="secondary" className="h-6 w-6 p-0">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
          
          {!isEditMode && (
            <div className="absolute top-2 right-2">
              <Button size="sm" variant="secondary" className="h-6 w-6 p-0">
                <Eye className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <h3 className="font-medium text-sm truncate">{item.name}</h3>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs">
              {item.clothing_type}
            </Badge>
            {item.is_basic && (
              <Badge variant="outline" className="text-xs">
                Базовая
              </Badge>
            )}
          </div>
          <div 
            className="w-4 h-4 rounded-full border border-gray-300"
            style={{ backgroundColor: item.color }}
            title={item.color}
          />
        </div>
      </CardContent>
    </Card>
  )
}
