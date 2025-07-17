"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CommonSheet } from "./common-sheet"
import { toast } from "sonner"

interface WardrobeItem {
  id: number
  item_name: string
  image_url?: string
  color?: string
  material?: string
  clothing_type?: string
}

interface CreateLookSheetProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { name: string; description: string; items: Array<{ type: string; id: number }> }) => void
}

export function CreateLookSheet({ isOpen, onClose, onSave }: CreateLookSheetProps) {
  const [name, setName] = useState("")
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadWardrobeItems()
      setName("")
      setSelectedItems(new Set())
    }
  }, [isOpen])

  const loadWardrobeItems = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const items = await response.json()
        setWardrobeItems(items)
      }
    } catch (error) {
      console.error("Error loading wardrobe items:", error)
      toast.error("Ошибка загрузки вещей")
    } finally {
      setLoading(false)
    }
  }

  const handleItemToggle = (itemId: number) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  const handleSubmit = async () => {
    if (selectedItems.size === 0) {
      toast.error("Выберите хотя бы одну вещь")
      return
    }

    const items = Array.from(selectedItems).map((id) => ({
      type: "user",
      id,
    }))

    await onSave({
      name: name.trim() || "Новый образ",
      description: "",
      items,
    })

    // Reset form
    setName("")
    setSelectedItems(new Set())
    onClose()
  }

  const handleClose = () => {
    setName("")
    setSelectedItems(new Set())
    onClose()
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Создать образ" backgroundColor="dark">
      <div className="space-y-6 pb-24">
        {/* Items Selection */}
        <div>
          <label className="block text-white font-medium text-sm mb-4">Выберите вещи</label>

          <div className="bg-white rounded-lg p-4 relative">
            {/* Badge in top left corner */}
            <div className="absolute top-3 left-3 bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-medium z-10">
              Мой гардероб ({wardrobeItems.length})
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Загрузка...</div>
            ) : wardrobeItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Нет вещей в гардеробе</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-2 pt-8">
                {wardrobeItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemToggle(item.id)}
                    className={`p-2 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      selectedItems.has(item.id)
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="aspect-square bg-gray-100 rounded mb-2 flex items-center justify-center p-1">
                      <img
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.item_name}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = "/placeholder.svg"
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-gray-900 truncate">{item.item_name}</p>
                      <p className="text-xs text-gray-500 truncate">{item.color}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Name Input - moved below items selection */}
        <div>
          <label className="block text-white font-medium text-sm mb-2">Название образа (необязательно)</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название образа"
            className="bg-white text-gray-900 border-gray-300"
          />
        </div>

        {selectedItems.size > 0 && (
          <div className="bg-blue-900 border border-blue-700 rounded-lg p-3">
            <p className="text-sm text-blue-100">
              Выбрано {selectedItems.size} вещ
              {selectedItems.size === 1 ? "ь" : selectedItems.size < 5 ? "и" : "ей"}
            </p>
          </div>
        )}
      </div>

      {/* Fixed Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-gray-700 p-4">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 bg-transparent"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedItems.size === 0}
            className="flex-1 bg-white hover:bg-gray-100 text-gray-900"
          >
            Сохранить образ
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
