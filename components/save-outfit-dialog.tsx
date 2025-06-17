"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import type { WardrobeItem } from "@/lib/wardrobe"

interface SaveOutfitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedItems: WardrobeItem[]
  onSuccess: () => void
  editingOutfit?: {
    id: number
    name: string
    description: string
    season: string
    occasion: string
  } | null
}

export function SaveOutfitDialog({
  open,
  onOpenChange,
  selectedItems,
  onSuccess,
  editingOutfit,
}: SaveOutfitDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [season, setSeason] = useState("")
  const [occasion, setOccasion] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // Заполняем форму при редактировании
  useEffect(() => {
    if (editingOutfit) {
      setName(editingOutfit.name)
      setDescription(editingOutfit.description || "")
      setSeason(editingOutfit.season || "")
      setOccasion(editingOutfit.occasion || "")
    } else {
      setName("")
      setDescription("")
      setSeason("")
      setOccasion("")
    }
  }, [editingOutfit, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name) {
      toast({
        title: "Ошибка",
        description: "Название образа обязательно",
        variant: "destructive",
      })
      return
    }

    if (selectedItems.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите хотя бы один элемент гардероба",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const method = editingOutfit ? "PUT" : "POST"
      const body = editingOutfit
        ? {
            id: editingOutfit.id,
            name,
            description,
            season,
            occasion,
            items: selectedItems.map((item) => item.id),
          }
        : {
            name,
            description,
            season,
            occasion,
            items: selectedItems.map((item) => item.id),
          }

      const response = await fetch("/api/outfits", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Ошибка при сохранении образа")
      }

      toast({
        title: "Успешно",
        description: editingOutfit ? "Образ успешно обновлен" : "Образ успешно сохранен",
      })

      // Сбрасываем форму
      setName("")
      setDescription("")
      setSeason("")
      setOccasion("")

      // Закрываем диалог
      onOpenChange(false)

      // Вызываем колбэк успешного сохранения
      onSuccess()
    } catch (error) {
      console.error("Error saving outfit:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить образ",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editingOutfit ? "Редактировать образ" : "Сохранить образ"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название образа *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Повседневный образ для офиса"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите образ..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="season">Сезон</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger id="season">
                  <SelectValue placeholder="Выберите сезон" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spring">Весна</SelectItem>
                  <SelectItem value="summer">Лето</SelectItem>
                  <SelectItem value="autumn">Осень</SelectItem>
                  <SelectItem value="winter">Зима</SelectItem>
                  <SelectItem value="all">Всесезонный</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="occasion">Повод</Label>
              <Select value={occasion} onValueChange={setOccasion}>
                <SelectTrigger id="occasion">
                  <SelectValue placeholder="Выберите повод" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Повседневный</SelectItem>
                  <SelectItem value="office">Офис</SelectItem>
                  <SelectItem value="sport">Спорт</SelectItem>
                  <SelectItem value="party">Вечеринка</SelectItem>
                  <SelectItem value="date">Свидание</SelectItem>
                  <SelectItem value="formal">Формальный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2">
            <div className="text-sm font-medium mb-2">Выбранные элементы: {selectedItems.length}</div>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map((item) => (
                <div key={item.id} className="bg-gray-100 rounded-md px-2 py-1 text-xs">
                  {item.item_type} ({item.color})
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingOutfit ? "Обновить" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
