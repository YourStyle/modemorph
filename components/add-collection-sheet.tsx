"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CommonSheet } from "@/components/common-sheet"

interface AddCollectionSheetProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (name: string) => void
}

export function AddCollectionSheet({ isOpen, onClose, onAdd }: AddCollectionSheetProps) {
  const [collectionName, setCollectionName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!collectionName.trim()) return

    setIsSubmitting(true)

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      onAdd(collectionName.trim())
      setCollectionName("")
      onClose()
    } catch (error) {
      console.error("Ошибка создания подборки:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setCollectionName("")
    onClose()
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Новая подборка">
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-white mb-8">{collectionName || "Название подборки"}</h2>
        </div>

        <div className="space-y-3">
          <Label htmlFor="collection-name" className="text-sm font-medium text-gray-300">
            Название подборки
          </Label>
          <Input
            id="collection-name"
            type="text"
            placeholder="Введите название подборки"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            className="h-14 text-base bg-white text-gray-900 border-2 border-gray-900 rounded-2xl placeholder:text-gray-500 focus:border-gray-900 focus:ring-0"
            autoFocus
          />
        </div>

        <div className="flex gap-3 pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="flex-1 h-14 bg-transparent border-2 border-gray-600 text-gray-300 hover:bg-slate-700 hover:text-white rounded-2xl"
            disabled={isSubmitting}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            className="flex-1 h-14 bg-gray-600 hover:bg-gray-700 text-white rounded-2xl font-medium"
            disabled={!collectionName.trim() || isSubmitting}
          >
            {isSubmitting ? "Создание..." : "Создать подборку"}
          </Button>
        </div>
      </form>
    </CommonSheet>
  )
}
