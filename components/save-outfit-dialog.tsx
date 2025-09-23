"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { Loader2 } from "lucide-react"
import { api } from "@/lib/api-client"

interface SaveOutfitDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedItems: any[]
  editingOutfitId?: number | null
}

export function SaveOutfitDialog({ isOpen, onClose, selectedItems, editingOutfitId }: SaveOutfitDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [season, setSeason] = useState("")
  const [occasion, setOccasion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { clearItems, setEditingOutfitId } = useSelectedItems()

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название образа",
        variant: "destructive",
      })
      return
    }

    if (selectedItems.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите хотя бы одну вещь",
        variant: "destructive",
      })
      return
    }

    const invalidItems = selectedItems.filter((item) => !item.id || typeof item.id !== "number")
    if (invalidItems.length > 0) {
      console.error("Invalid items found:", invalidItems)
      toast({
        title: "Ошибка",
        description: "Некоторые выбранные вещи имеют неверный формат данных",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const method = editingOutfitId ? "PUT" : "POST"

      const requestBody = {
        name: name.trim(),
        description: description.trim(),
        season,
        occasion,
        items: selectedItems
          .filter((item) => item.id && typeof item.id === "number") // Filter out invalid items
          .map((item, index) => ({
            wardrobe_item_id: item.id,
            position: index + 1,
          })),
      }

      if (editingOutfitId) {
        requestBody.id = editingOutfitId
      }

      console.log("Saving outfit with data:", {
        ...requestBody,
        items: requestBody.items.map((item) => ({ wardrobe_item_id: item.wardrobe_item_id, position: item.position })),
      })

      const data = editingOutfitId
        ? await api.put("/api/outfits", requestBody)
        : await api.post("/api/outfits", requestBody)

      toast({
        title: editingOutfitId ? "Образ обновлен" : "Образ сохранен",
        description: `Образ "${name}" успешно ${editingOutfitId ? "обновлен" : "сохранен"}`,
      })

      // Очищаем форму и выбранные элементы
      setName("")
      setDescription("")
      setSeason("")
      setOccasion("")
      clearItems()
      setEditingOutfitId(null)
      onClose()
    } catch (error) {
      console.error("Error saving outfit:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить образ",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingOutfitId ? "Обновить образ" : "Сохранить образ"}</DialogTitle>
          <DialogDescription>
            {editingOutfitId ? "Обновите информацию об образе" : "Создайте новый образ из выбранных вещей"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Название образа *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Деловой стиль"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание образа..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="season">Сезон</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сезон" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spring">Весна</SelectItem>
                  <SelectItem value="summer">Лето</SelectItem>
                  <SelectItem value="autumn">Осень</SelectItem>
                  <SelectItem value="winter">Зима</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="occasion">Повод</Label>
              <Select value={occasion} onValueChange={setOccasion}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите повод" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Повседневный</SelectItem>
                  <SelectItem value="work">Работа</SelectItem>
                  <SelectItem value="party">Вечеринка</SelectItem>
                  <SelectItem value="sport">Спорт</SelectItem>
                  <SelectItem value="formal">Официальный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-gray-600">Выбрано вещей: {selectedItems.length}</div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingOutfitId ? "Обновить" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
