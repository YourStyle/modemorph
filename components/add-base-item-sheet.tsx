"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus } from "lucide-react"
import Image from "next/image"

interface BasicItem {
  id: number
  item_name: string
  image_url: string
  material: string
  style: string
  color: string
  shade: string
  has_print: string
  has_details: string
}

interface AddBaseItemSheetProps {
  isOpen: boolean
  onClose: () => void
  item: BasicItem | null
  onSuccess?: () => void
}

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"]
const MATERIALS = ["Хлопок", "Полиэстер", "Шерсть", "Лен", "Шелк", "Джинса", "Трикотаж", "Кожа", "Замша"]
const STYLES = ["Классический", "Спортивный", "Повседневный", "Деловой", "Вечерний", "Уличный"]
const COLORS = ["Белый", "Черный", "Серый", "Синий", "Красный", "Зеленый", "Желтый", "Розовый", "Коричневый", "Бежевый"]
const SHADES = ["Светлый", "Темный", "Яркий", "Пастельный", "Насыщенный"]

export function AddBaseItemSheet({ isOpen, onClose, item, onSuccess }: AddBaseItemSheetProps) {
  const [formData, setFormData] = useState({
    customName: "",
    size: "",
    material: "",
    style: "",
    color: "",
    shade: "",
    hasPrint: "нет",
    hasDetails: "",
    notes: "",
  })
  const [isAdding, setIsAdding] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return

    setIsAdding(true)
    try {
      const itemData = {
        item_name: formData.customName || item.item_name,
        material: formData.material || item.material,
        color: formData.color || item.color,
        style: formData.style || item.style,
        has_print: formData.hasPrint,
        shade: formData.shade || item.shade,
        has_details: formData.hasDetails || item.has_details,
        image_url: item.image_url,
        basic_item_id: item.id,
        size: formData.size,
        notes: formData.notes,
      }

      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(itemData),
      })

      if (!response.ok) {
        throw new Error("Ошибка добавления вещи")
      }

      onSuccess?.()
      onClose()

      // Сброс формы
      setFormData({
        customName: "",
        size: "",
        material: "",
        style: "",
        color: "",
        shade: "",
        hasPrint: "нет",
        hasDetails: "",
        notes: "",
      })
    } catch (error) {
      console.error("Error adding item:", error)
    } finally {
      setIsAdding(false)
    }
  }

  if (!item) return null

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Добавить в гардероб</SheetTitle>
          <SheetDescription>Настройте параметры вещи перед добавлением в ваш гардероб</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Изображение и базовая информация */}
          <div className="flex gap-4">
            <div className="w-20 h-20 relative bg-gray-50 rounded-lg overflow-hidden flex-shrink-0">
              <Image
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm mb-2">{item.item_name}</h3>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs">
                  {item.material}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {item.color}
                </Badge>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Пользовательское название */}
            <div className="space-y-2">
              <Label htmlFor="customName">Название (необязательно)</Label>
              <Input
                id="customName"
                placeholder={item.item_name}
                value={formData.customName}
                onChange={(e) => setFormData({ ...formData, customName: e.target.value })}
              />
            </div>

            {/* Размер */}
            <div className="space-y-2">
              <Label htmlFor="size">Размер *</Label>
              <Select value={formData.size} onValueChange={(value) => setFormData({ ...formData, size: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите размер" />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Материал */}
            <div className="space-y-2">
              <Label htmlFor="material">Материал</Label>
              <Select
                value={formData.material}
                onValueChange={(value) => setFormData({ ...formData, material: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={item.material} />
                </SelectTrigger>
                <SelectContent>
                  {MATERIALS.map((material) => (
                    <SelectItem key={material} value={material}>
                      {material}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Стиль */}
            <div className="space-y-2">
              <Label htmlFor="style">Стиль</Label>
              <Select value={formData.style} onValueChange={(value) => setFormData({ ...formData, style: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={item.style} />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Цвет */}
            <div className="space-y-2">
              <Label htmlFor="color">Цвет</Label>
              <Select value={formData.color} onValueChange={(value) => setFormData({ ...formData, color: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={item.color} />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Оттенок */}
            <div className="space-y-2">
              <Label htmlFor="shade">Оттенок</Label>
              <Select value={formData.shade} onValueChange={(value) => setFormData({ ...formData, shade: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={item.shade || "Выберите оттенок"} />
                </SelectTrigger>
                <SelectContent>
                  {SHADES.map((shade) => (
                    <SelectItem key={shade} value={shade}>
                      {shade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Принт */}
            <div className="space-y-2">
              <Label htmlFor="hasPrint">Принт</Label>
              <Select
                value={formData.hasPrint}
                onValueChange={(value) => setFormData({ ...formData, hasPrint: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="есть">Есть</SelectItem>
                  <SelectItem value="нет">Нет</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Детали */}
            <div className="space-y-2">
              <Label htmlFor="hasDetails">Детали</Label>
              <Input
                id="hasDetails"
                placeholder={item.has_details || "Описание деталей"}
                value={formData.hasDetails}
                onChange={(e) => setFormData({ ...formData, hasDetails: e.target.value })}
              />
            </div>

            {/* Заметки */}
            <div className="space-y-2">
              <Label htmlFor="notes">Заметки (необязательно)</Label>
              <Textarea
                id="notes"
                placeholder="Дополнительные заметки о вещи"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent">
                Отмена
              </Button>
              <Button type="submit" disabled={isAdding || !formData.size} className="flex-1">
                {isAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Добавляем...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
