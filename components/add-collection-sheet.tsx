"use client"

import type React from "react"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

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
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[400px]">
        <SheetHeader>
          <SheetTitle>Создать подборку</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="collection-name">Название подборки</Label>
              <Input
                id="collection-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Офисные образы"
                required
              />
            </div>

            <div>
              <Label htmlFor="collection-description">Описание (необязательно)</Label>
              <Textarea
                id="collection-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Добавьте описание подборки"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1 bg-transparent">
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim() || loading} className="flex-1">
              {loading ? "Создание..." : "Создать подборку"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
