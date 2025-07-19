"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Trash2, Save, ChevronUp, ChevronDown } from "lucide-react"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { SaveOutfitDialog } from "@/components/save-outfit-dialog"

interface SelectedItemsBarProps {
  editingOutfitId?: number
}

export function SelectedItemsBar({ editingOutfitId }: SelectedItemsBarProps) {
  const { selectedItems, removeItem, clearItems } = useSelectedItems()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  if (selectedItems.length === 0) {
    return null
  }

  const handleRemoveItem = (item: any) => {
    removeItem(item.type, item.id)
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className={`transition-all duration-300 ${isExpanded ? "h-64" : "h-24"}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-gray-900">Выбрано {selectedItems.length} вещи</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="p-1 h-6 w-6">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={clearItems} className="text-gray-500 hover:text-gray-700">
              Очистить
            </Button>
          </div>

          {/* Items Grid */}
          <div
            className="p-4 overflow-y-auto"
            style={{ height: isExpanded ? "calc(100% - 120px)" : "calc(100% - 60px)" }}
          >
            <div
              className={`grid gap-2 ${
                isExpanded
                  ? "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10"
                  : "grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12"
              }`}
            >
              {selectedItems.map((item) => (
                <div key={`${item.type}-${item.id}`} className="relative group">
                  <div
                    className={`aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200 ${
                      isExpanded ? "w-16 h-16" : "w-12 h-12"
                    }`}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.item_name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <span className="text-xs text-gray-500">👕</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveItem(item)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
            <div className="flex gap-2">
              <Button
                onClick={() => setShowSaveDialog(true)}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
                disabled={selectedItems.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                {editingOutfitId ? "Обновить образ" : "Сохранить образ"}
              </Button>
              <Button variant="outline" onClick={clearItems} className="px-4 bg-transparent">
                <Trash2 className="h-4 w-4" />
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
      />
    </>
  )
}
