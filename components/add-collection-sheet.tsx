"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CommonSheet } from "@/components/common-sheet"

interface AddCollectionSheetProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (name: string, description?: string) => void
}

export function AddCollectionSheet({ isOpen, onClose, onAdd }: AddCollectionSheetProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      return
    }

    setLoading(true)
    try {
      await onAdd(name.trim(), description.trim() || undefined)

      // Reset form
      setName("")
      setDescription("")
      onClose()
    } catch (error) {
      console.error("Error adding collection:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName("")
    setDescription("")
    onClose()
  }

  return (
    <CommonSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="Создать подборку"
      subtitle="Добавьте новую подборку образов"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="collection-name" className="text-gray-900 font-medium text-sm mb-2 block">
              Название подборки
            </Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Офисные образы"
              required
              className="w-full"
            />
          </div>

          <div>
            <Label htmlFor="collection-description" className="text-gray-900 font-medium text-sm mb-2 block">
              Описание (необязательно)
            </Label>
            <Textarea
              id="collection-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Добавьте описание подборки"
              rows={3}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-6 border-t border-gray-200 bg-white sticky bottom-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="flex-1 border-gray-300 text-gray-700 bg-transparent"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || loading}
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
          >
            {loading ? "Создание..." : "Создать подборку"}
          </Button>
        </div>
      </form>
    </CommonSheet>
  )
}
