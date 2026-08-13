"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CommonSheet } from "./common-sheet"
import { toast } from "sonner"
import { Check } from "lucide-react"
import { api } from "@/lib/api-client"

interface WardrobeItem {
  id: number
  item_name: string
  image_url?: string
  color?: string
  material?: string
  clothing_type?: string
  gender?: string
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
  const [saving, setSaving] = useState(false)

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
      const items = await api.get("/api/wardrobe-user-items")
      setWardrobeItems(items)
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

    if (saving) return

    setSaving(true)
    try {
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
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setName("")
    setSelectedItems(new Set())
    onClose()
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Создать образ">
      <div className="space-y-6 pb-28">
        {/* Items Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-caption font-semibold text-ink-2">Выберите вещи</label>
            <span className="text-caption text-ink-3">{wardrobeItems.length} в гардеробе</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 gap-2.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-[14px] overflow-hidden">
                  <div className="skeleton aspect-square" />
                </div>
              ))}
            </div>
          ) : wardrobeItems.length === 0 ? (
            <div className="text-center py-10 text-ink-2 text-body">Нет вещей в гардеробе</div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-0.5">
              {wardrobeItems.map((item) => {
                const isSelected = selectedItems.has(item.id)
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleItemToggle(item.id)}
                    className={`relative aspect-square rounded-[14px] bg-canvas-sunk flex items-center justify-center p-2.5 ring-2 transition-transform duration-press active:scale-[.97] ${
                      isSelected ? "ring-signal" : "ring-transparent"
                    }`}
                  >
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt={item.item_name}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src = "/placeholder.svg"
                      }}
                    />
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-signal text-signal-ink flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Name Input */}
        <div>
          <label className="block text-caption font-semibold text-ink-2 mb-2">Название образа (необязательно)</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Введите название образа" />
        </div>

        {selectedItems.size > 0 && (
          <p className="text-caption text-ink-2">
            Выбрано {selectedItems.size} вещ
            {selectedItems.size === 1 ? "ь" : selectedItems.size < 5 ? "и" : "ей"}
          </p>
        )}
      </div>

      {/* Fixed Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-canvas border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={selectedItems.size === 0 || saving} className="flex-1">
            {saving ? "Сохраняем..." : "Сохранить образ"}
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
