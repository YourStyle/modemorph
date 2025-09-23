"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CommonSheet } from "./common-sheet"
import { toast } from "sonner"
import { Check } from "lucide-react"
import { api } from "@/lib/api-client"

interface SavedLook {
  id: number
  name: string
  description?: string
  items: Array<{ type: string; id: number }>
  expandedItems?: Array<{
    id: number
    item_name?: string
    name_ru?: string
    image_url?: string
    color?: string
    material?: string
    source: "user" | "basic"
  }>
  created_at: string
}

interface AddOutfitsToCollectionSheetProps {
  isOpen: boolean
  onClose: () => void
  sectionId: number
  sectionName: string
  existingLookIds: number[]
  onAdd: (sectionId: number, lookIds: number[]) => void
}

export function AddOutfitsToCollectionSheet({
  isOpen,
  onClose,
  sectionId,
  sectionName,
  existingLookIds,
  onAdd,
}: AddOutfitsToCollectionSheetProps) {
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([])
  const [selectedLooks, setSelectedLooks] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSavedLooks()
      setSelectedLooks(new Set())
    }
  }, [isOpen])

  const loadSavedLooks = async () => {
    setLoading(true)
    try {
      const looks = await api.get("/api/user-looks")
      setSavedLooks(looks)
    } catch (error) {
      console.error("Error loading saved looks:", error)
      toast.error("Ошибка загрузки образов")
    } finally {
      setLoading(false)
    }
  }

  const handleLookToggle = (lookId: number) => {
    const newSelected = new Set(selectedLooks)
    if (newSelected.has(lookId)) {
      newSelected.delete(lookId)
    } else {
      newSelected.add(lookId)
    }
    setSelectedLooks(newSelected)
  }

  const handleSubmit = async () => {
    if (selectedLooks.size === 0) {
      toast.error("Выберите хотя бы один образ")
      return
    }

    await onAdd(sectionId, Array.from(selectedLooks))
    setSelectedLooks(new Set())
    onClose()
  }

  const handleClose = () => {
    setSelectedLooks(new Set())
    onClose()
  }

  // Filter out looks that are already in the collection
  const availableLooks = savedLooks.filter((look) => !existingLookIds.includes(look.id))

  const LookCard = ({ look }: { look: SavedLook }) => {
    const items = look.expandedItems || []
    const isSelected = selectedLooks.has(look.id)

    return (
      <div
        onClick={() => handleLookToggle(look.id)}
        className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
          isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
        }`}
      >
        {isSelected && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1 z-10">
            <Check className="w-3 h-3" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-1 mb-3 min-h-[120px]">
          {items.length === 0 ? (
            <div className="col-span-3 flex items-center justify-center text-gray-500">
              <p className="text-xs">Нет вещей</p>
            </div>
          ) : (
            items.slice(0, 6).map((item, index) => {
              const itemName = item.source === "user" ? item.item_name : item.name_ru
              const imageUrl = item.image_url || "/placeholder.svg"

              return (
                <div
                  key={`${item.source}-${item.id}-${index}`}
                  className="aspect-square bg-gray-50 rounded flex items-center justify-center p-0.5"
                >
                  <img
                    src={imageUrl || "/placeholder.svg"}
                    alt={itemName || "Item"}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = "/placeholder.svg"
                    }}
                  />
                </div>
              )
            })
          )}
        </div>

        <div>
          <h4 className="font-medium text-sm text-gray-900 truncate">{look.name}</h4>
          {look.description && <p className="text-xs text-gray-500 truncate mt-1">{look.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{items.length} вещей</p>
        </div>
      </div>
    )
  }

  return (
    <CommonSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Добавить образы"
      subtitle={`в подборку "${sectionName}"`}
      backgroundColor="white"
    >
      <div className="space-y-4 pb-24">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Загрузка образов...</div>
        ) : availableLooks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Нет доступных образов для добавления</p>
            <p className="text-xs mt-1">Все ваши образы уже добавлены в эту подборку</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Доступно {availableLooks.length} образ
                {availableLooks.length === 1 ? "" : availableLooks.length < 5 ? "а" : "ов"}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-2">
              {availableLooks.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </div>

            {selectedLooks.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  Выбрано {selectedLooks.size} образ
                  {selectedLooks.size === 1 ? "" : selectedLooks.size < 5 ? "а" : "ов"}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fixed Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 bg-transparent"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedLooks.size === 0}
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
          >
            Добавить ({selectedLooks.size})
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
