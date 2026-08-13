"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CommonSheet } from "./common-sheet"
import { toast } from "sonner"

interface AddCollectionSheetProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (name: string, description?: string) => void
}

export function AddCollectionSheet({ isOpen, onClose, onAdd }: AddCollectionSheetProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Введите название подборки")
      return
    }

    setLoading(true)
    try {
      await onAdd(name.trim())
      toast.success("Подборка создана!")
      handleClose()
    } catch (error) {
      console.error("Error creating section:", error)
      toast.error("Ошибка создания подборки")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName("")
    onClose()
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Новая подборка">
      <div className="space-y-6 pb-28">
        <div>
          <label className="block text-caption font-semibold text-ink-2 mb-2">Название подборки</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название подборки"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                handleSubmit()
              }
            }}
          />
        </div>
      </div>

      {/* Fixed Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-canvas border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || loading} className="flex-1">
            {loading ? "Создание..." : "Создать"}
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
