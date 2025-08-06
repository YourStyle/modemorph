'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Save, Trash2 } from 'lucide-react'
import { useSelectedItems } from '@/contexts/selected-items-context'
import { SaveOutfitDialog } from '@/components/save-outfit-dialog'
import Image from 'next/image'

export function SelectedItemsBar() {
  const { selectedItems, clearItems, removeItem, editingOutfitId } = useSelectedItems()
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  if (selectedItems.length === 0) {
    return null
  }

  const handleSaveSuccess = () => {
    setShowSaveDialog(false)
    clearItems()
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {selectedItems.length} {selectedItems.length === 1 ? 'вещь' : selectedItems.length < 5 ? 'вещи' : 'вещей'}
                </Badge>
                <span className="text-sm text-gray-600">выбрано</span>
              </div>

              {/* Миниатюры выбранных вещей */}
              <div className="flex gap-2 max-w-md overflow-x-auto">
                {selectedItems.slice(0, 5).map((item) => (
                  <div key={`${item.type}-${item.id}`} className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      {item.image_url ? (
                        <Image
                          src={item.image_url || "/placeholder.svg"}
                          alt={item.item_name || item.basic_wardrobe_items?.name_ru || 'Вещь'}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                          <span className="text-xs text-gray-400">Нет фото</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.type, item.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                ))}
                {selectedItems.length > 5 && (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                    <span className="text-xs text-gray-500">+{selectedItems.length - 5}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearItems}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Очистить
              </Button>
              <Button
                size="sm"
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingOutfitId ? 'Обновить образ' : 'Сохранить образ'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SaveOutfitDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        selectedItems={selectedItems}
        editingOutfitId={editingOutfitId}
        onSave={handleSaveSuccess}
      />
    </>
  )
}
