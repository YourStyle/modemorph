import React from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { Item } from '@/types'
import { PlaceholderImage } from './PlaceholderImage'

interface ItemGridProps {
  items: Item[]
  onItemClick?: (item: Item) => void
  selectedItems?: string[]
  showSelection?: boolean
  className?: string
}

export default function ItemGrid({ 
  items, 
  onItemClick, 
  selectedItems = [], 
  showSelection = false,
  className = ""
}: ItemGridProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 ${className}`}>
      {items.map((item) => {
        const isSelected = selectedItems.includes(item.id)
        
        return (
          <Card 
            key={item.id} 
            className={`cursor-pointer transition-all hover:shadow-md ${
              isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}
            onClick={() => onItemClick?.(item)}
          >
            <CardContent className="p-3">
              <div className="relative aspect-square mb-3">
                {item.image_url ? (
                  <Image
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.name || 'Вещь'}
                    fill
                    className="object-cover rounded-md"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                  />
                ) : (
                  <PlaceholderImage className="rounded-md" />
                )}
                
                {showSelection && isSelected && (
                  <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <h3 className="font-medium text-sm truncate">
                  {item.name || 'Без названия'}
                </h3>
                
                {item.clothing_type && (
                  <Badge variant="secondary" className="text-xs">
                    {item.clothing_type}
                  </Badge>
                )}
                
                {item.color && (
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full border border-gray-300"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-gray-600">{item.color}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export { ItemGrid }
