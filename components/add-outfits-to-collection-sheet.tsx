"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CommonSheet } from "./common-sheet"
import { toast } from "sonner"
import { Check, Package } from "lucide-react"
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

  const LookTile = ({ look }: { look: SavedLook }) => {
    const items = look.expandedItems || []
    const shown = items.slice(0, 4)
    const isSelected = selectedLooks.has(look.id)

    return (
      <button
        type="button"
        onClick={() => handleLookToggle(look.id)}
        className={`text-left rounded-[18px] overflow-hidden ring-2 transition-transform duration-press active:scale-[.98] ${
          isSelected ? "ring-signal" : "ring-transparent"
        }`}
      >
        <div className="relative">
          {shown.length === 0 ? (
            <div className="aspect-square bg-canvas-sunk ring-1 ring-inset ring-line flex items-center justify-center">
              <Package className="w-6 h-6 text-ink-3" />
            </div>
          ) : (
            // p-px по контуру той же линией, что и внутренние швы — светлые вещи
            // не растворяются в canvas-sunk, а толщина шва нигде не удваивается.
            <div
              className={`grid gap-px aspect-square bg-line p-px ${
                shown.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {shown.map((item, index) => {
                const itemName = item.source === "user" ? item.item_name : item.name_ru
                return (
                  <div
                    key={`${item.source}-${item.id}-${index}`}
                    className={`bg-canvas-sunk flex items-center justify-center p-2 ${
                      shown.length === 3 && index === 0 ? "row-span-2" : ""
                    }`}
                  >
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt={itemName || "Вещь"}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src = "/placeholder.svg"
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {isSelected && (
            <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-signal text-signal-ink flex items-center justify-center">
              <Check className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        <div className="px-2.5 pt-2 pb-2.5">
          <h4 className="text-caption font-semibold text-ink truncate">{look.name}</h4>
          <p className="text-caption text-ink-2 mt-0.5">{items.length} вещей</p>
        </div>
      </button>
    )
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Добавить образы">
      <div className="space-y-4 pb-28">
        <p className="text-caption text-ink-3 -mt-2">в подборку «{sectionName}»</p>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[18px] overflow-hidden">
                <div className="skeleton aspect-square" />
                <div className="px-2.5 pt-2 pb-2.5 space-y-1.5">
                  <div className="skeleton h-3 w-4/5 rounded-full" />
                  <div className="skeleton h-2.5 w-2/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : availableLooks.length === 0 ? (
          <div className="text-center py-10 text-ink-2">
            <p className="text-body">Нет доступных образов для добавления</p>
            <p className="text-caption text-ink-3 mt-1">Все ваши образы уже добавлены в эту подборку</p>
          </div>
        ) : (
          <>
            <p className="text-caption text-ink-2">
              Доступно {availableLooks.length} образ
              {availableLooks.length === 1 ? "" : availableLooks.length < 5 ? "а" : "ов"}
            </p>

            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-0.5">
              {availableLooks.map((look) => (
                <LookTile key={look.id} look={look} />
              ))}
            </div>

            {selectedLooks.size > 0 && (
              <p className="text-caption text-ink-2">
                Выбрано {selectedLooks.size} образ
                {selectedLooks.size === 1 ? "" : selectedLooks.size < 5 ? "а" : "ов"}
              </p>
            )}
          </>
        )}
      </div>

      {/* Fixed Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-canvas border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={selectedLooks.size === 0} className="flex-1">
            Добавить ({selectedLooks.size})
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
