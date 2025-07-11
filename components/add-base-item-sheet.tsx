"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CommonSheet } from "@/components/common-sheet"
import { useToast } from "@/hooks/use-toast"

interface BasicWardrobeItem {
  id: number
  item_name: string
  description?: string
  clothing_type: string
  image_url?: string
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string
  has_details?: string
}

interface AddBaseItemSheetProps {
  isOpen: boolean
  onClose: () => void
  item: BasicWardrobeItem | null
  onSuccess: () => void
}

const sizeOptions = ["XS", "S", "M", "L", "XL", "XXL", "36", "38", "40", "42", "44", "46", "48", "50"]
const materialOptions = ["Хлопок", "Шерсть", "Полиэстер", "Лен", "Шелк", "Кашемир", "Деним", "Кожа", "Замша"]
const styleOptions = ["Классический", "Casual", "Спортивный", "Романтический", "Минималистичный", "Бохо"]
const colorOptions = ["Черный", "Белый", "Серый", "Синий", "Красный", "Зеленый", "Желтый", "Розовый", "Коричневый"]
const shadeOptions = ["Светлый", "Средний", "Темный"]
const printOptions = ["Нет", "Полоска", "Клетка", "Горошек", "Цветочный", "Геометрический", "Абстрактный"]
const detailsOptions = ["Нет", "Пуговицы", "Молния", "Кружево", "Вышивка", "Аппликация", "Стразы"]

export function AddBaseItemSheet({ isOpen, onClose, item, onSuccess }: AddBaseItemSheetProps) {
  const [formData, setFormData] = useState({
    customName: "",
    size: "",
    material: "",
    style: "",
    color: "",
    shade: "",
    print: "",
    details: "",
    notes: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!item || !formData.size) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите размер",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)

      const itemData = {
        item_name: formData.customName || item.item_name,
        basic_item_id: item.id,
        size_type: formData.size,
        material: formData.material || item.material || "",
        style: formData.style || item.style || "",
        color: formData.color || item.color || "",
        shade: formData.shade || item.shade || "",
        has_print: formData.print || item.has_print || "нет",
        has_details: formData.details || item.has_details || "нет",
        notes: formData.notes,
        image_url: item.image_url,
        url: item.image_url || "",
        is_basic: true,
      }

      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(itemData),
      })

      if (!response.ok) {
        throw new Error("Failed to add item")
      }

      toast({
        title: "Успешно",
        description: "Вещь добавлена в ваш гардероб",
      })

      // Сброс формы
      setFormData({
        customName: "",
        size: "",
        material: "",
        style: "",
        color: "",
        shade: "",
        print: "",
        details: "",
        notes: "",
      })

      onSuccess()
    } catch (error) {
      console.error("Error adding item:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось добавить вещь в гардероб",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!item) return null

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Добавить в гардероб">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Изображение и название */}
        <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
            {item.image_url ? (
              <img
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl">👕</span>
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900 mb-1">{item.item_name}</h3>
            <p className="text-sm text-gray-500 mb-1">{item.clothing_type}</p>
            {item.description && <p className="text-xs text-gray-400 line-clamp-2">{item.description}</p>}
          </div>
        </div>

        {/* Пользовательское название */}
        <div className="space-y-2">
          <Label htmlFor="customName">Название (необязательно)</Label>
          <Input
            id="customName"
            value={formData.customName}
            onChange={(e) => setFormData({ ...formData, customName: e.target.value })}
            placeholder={item.item_name}
            className="bg-white border-gray-300 rounded-xl h-12"
          />
        </div>

        {/* Размер - обязательное поле */}
        <div className="space-y-2">
          <Label htmlFor="size">Размер *</Label>
          <Select value={formData.size} onValueChange={(value) => setFormData({ ...formData, size: value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
              <SelectValue placeholder="Выберите размер" />
            </SelectTrigger>
            <SelectContent>
              {sizeOptions.map((size) => (
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
          <Select value={formData.material} onValueChange={(value) => setFormData({ ...formData, material: value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
              <SelectValue placeholder={item.material || "Выберите материал"} />
            </SelectTrigger>
            <SelectContent>
              {materialOptions.map((material) => (
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
            <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
              <SelectValue placeholder={item.style || "Выберите стиль"} />
            </SelectTrigger>
            <SelectContent>
              {styleOptions.map((style) => (
                <SelectItem key={style} value={style}>
                  {style}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Цвет и оттенок */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="color">Цвет</Label>
            <Select value={formData.color} onValueChange={(value) => setFormData({ ...formData, color: value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
                <SelectValue placeholder={item.color || "Цвет"} />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((color) => (
                  <SelectItem key={color} value={color}>
                    {color}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shade">Оттенок</Label>
            <Select value={formData.shade} onValueChange={(value) => setFormData({ ...formData, shade: value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
                <SelectValue placeholder={item.shade || "Оттенок"} />
              </SelectTrigger>
              <SelectContent>
                {shadeOptions.map((shade) => (
                  <SelectItem key={shade} value={shade}>
                    {shade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Принт и детали */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="print">Принт</Label>
            <Select value={formData.print} onValueChange={(value) => setFormData({ ...formData, print: value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
                <SelectValue placeholder={item.has_print || "Принт"} />
              </SelectTrigger>
              <SelectContent>
                {printOptions.map((print) => (
                  <SelectItem key={print} value={print}>
                    {print}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Детали</Label>
            <Select value={formData.details} onValueChange={(value) => setFormData({ ...formData, details: value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
                <SelectValue placeholder={item.has_details || "Детали"} />
              </SelectTrigger>
              <SelectContent>
                {detailsOptions.map((detail) => (
                  <SelectItem key={detail} value={detail}>
                    {detail}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Заметки */}
        <div className="space-y-2">
          <Label htmlFor="notes">Заметки (необязательно)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Дополнительная информация о вещи..."
            rows={3}
            className="bg-white border-gray-300 rounded-xl"
          />
        </div>

        {/* Кнопки */}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent rounded-xl h-12">
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !formData.size}
            className="flex-1 bg-gray-800 hover:bg-gray-900 rounded-xl h-12"
          >
            {isSubmitting ? "Добавление..." : "Добавить"}
          </Button>
        </div>
      </form>
    </CommonSheet>
  )
}
