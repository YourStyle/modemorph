"use client"

import { useSelectedItems } from "@/contexts/selected-items-context"
import { Button } from "@/components/ui/button"
import { X, Save, Trash2 } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { SaveOutfitDialog } from "@/components/save-outfit-dialog"
import { cn } from "@/lib/utils"
import { getClothingTypeName } from "@/lib/clothing-types"

export function SelectedItemsBar() {
  const { selectedItems, removeItem, clearItems, editingOutfitId } = useSelectedItems()
  const [isOpen, setIsOpen] = useState(false)
  const [isBarExpanded, setIsBarExpanded] = useState(false)

  if (selectedItems.length === 0) return null

  const editingOutfit = editingOutfitId
    ? {
        id: editingOutfitId,
        name: "",
        description: "",
        season: "",
        occasion: "",
      }
    : null

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg transition-all duration-300 z-50",
          isBarExpanded ? "h-64" : "h-24",
        )}
      >
        <div className="container mx-auto px-4 h-full">
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {editingOutfitId ? "Редактирование образа" : "Создание образа"}: {selectedItems.length} элементов
              </span>
              <Button variant="ghost" size="sm" onClick={() => setIsBarExpanded(!isBarExpanded)} className="text-xs">
                {isBarExpanded ? "Свернуть" : "Развернуть"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearItems} className="text-xs flex items-center gap-1">
                <Trash2 className="h-3 w-3" />
                Очистить
              </Button>
              <Button size="sm" onClick={() => setIsOpen(true)} className="text-xs flex items-center gap-1">
                <Save className="h-3 w-3" />
                {editingOutfitId ? "��охранить изменения" : "Сохранить образ"}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "flex gap-3 py-3 overflow-x-auto",
              isBarExpanded ? "flex-wrap overflow-y-auto" : "flex-nowrap",
            )}
          >
            {selectedItems.map((item) => (
              <div key={item.id} className={cn("relative group", isBarExpanded ? "w-24" : "w-16")}>
                <div className="relative aspect-square bg-gray-100 rounded-md overflow-hidden">
                  {item.image_url ? (
                    <Image
                      src={item.image_url || "/placeholder.svg"}
                      alt={item.item_name}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gray-200">
                      <span className="text-xs text-gray-500">Нет фото</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Удалить"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {isBarExpanded && (
                  <div className="mt-1 text-xs text-center line-clamp-2">{getClothingTypeName(item.item_type)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <SaveOutfitDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        selectedItems={selectedItems}
        onSuccess={() => clearItems()}
        editingOutfit={editingOutfit}
      />
    </>
  )
}
