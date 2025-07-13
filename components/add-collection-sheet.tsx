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
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Новая подборка" backgroundColor="dark">
      <div className="space-y-6 pb-24">
        <div>
          <label className="block text-white font-medium text-sm mb-2">Название подборки</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название подборки"
            className="bg-white text-gray-900 border-gray-300"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                handleSubmit()
              }
            }}
          />
        </div>
      </div>

      {/* Fixed Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-gray-700 p-4">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 bg-transparent"
            disabled={loading}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || loading}
            className="flex-1 bg-white hover:bg-gray-100 text-gray-900"
          >
            {loading ? "Создание..." : "Создать"}
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
