import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { X, Save, Trash2 } from 'lucide-react'
import Image from 'next/image'

interface SelectedItem {
  id: string
  name: string
  image_url?: string
}

interface SelectedItemsPanelProps {
  selectedItems: SelectedItem[]
  onRemoveItem: (itemId: string) => void
  onSaveOutfit: () => void
  onClear: () => void
}

export function SelectedItemsPanel({
  selectedItems,
  onRemoveItem,
  onSaveOutfit,
  onClear
}: SelectedItemsPanelProps) {
  if (selectedItems.length === 0) {
    return null
  }

  return (
    <Card className="fixed bottom-4 left-4 right-4 z-50 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Выбрано вещей: {selectedItems.length}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Очистить
            </Button>
            <Button
              size="sm"
              onClick={onSaveOutfit}
              disabled={selectedItems.length === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              Сохранить образ
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {selectedItems.map((item) => (
            <div
              key={item.id}
              className="relative flex-shrink-0 w-20 h-20 bg-gray-100 rounded-lg overflow-hidden"
            >
              {item.image_url ? (
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.name || 'Вещь'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xs text-gray-500">Нет фото</span>
                </div>
              )}
              
              <button
                onClick={() => onRemoveItem(item.id)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
              
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                {item.name || 'Без названия'}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
