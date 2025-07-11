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

export function AddBaseItemSheet({ isOpen, onClose, item, onSuccess }: AddBaseItemSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    customName: "",
    size: "",
    material: "",
    style: "",
    color: "",
    shade: "",
    hasPrint: "",
    hasDetails: "",
    notes: "",
  })
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item || !formData.size) return

    try {
      setIsLoading(true)

      const payload = {
        basic_item_id: item.id,
        item_name: formData.customName || item.item_name,
        size_type: formData.size,
        material: formData.material || item.material || "",
        style: formData.style || item.style || "",
        color: formData.color || item.color || "",
        shade: formData.shade || item.shade || "",
        has_print: formData.hasPrint || item.has_print || "нет",
        has_details: formData.hasDetails || item.has_details || "нет",
        notes: formData.notes,
        image_url: item.image_url,
        is_basic: true,
      }

      const response = await fetch("/api/wardrobe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("Failed to add item")
      }

      toast({
        title: "Вещь добавлена",
        description: "Базовая вещь успешно добавлена в ваш гардероб",
      })

      // Сброс формы
      setFormData({
        customName: "",
        size: "",
        material: "",
        style: "",
        color: "",
        shade: "",
        hasPrint: "",
        hasDetails: "",
        notes: "",
      })

      onSuccess()
    } catch (error) {
      console.error("Error adding base item:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось добавить вещь в гардероб",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      customName: "",
      size: "",
      material: "",
      style: "",
      color: "",
      shade: "",
      hasPrint: "",
      hasDetails: "",
      notes: "",
    })
    onClose()
  }

  if (!item) return null

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Добавить в гардероб">
      <div className="p-6 space-y-6">
        {/* Информация о базовой вещи */}
        <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
            {item.image_url ? (
              <img
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <span className="text-2xl">👕</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 mb-1">{item.item_name}</h3>
            {item.description && <p className="text-sm text-gray-600 mb-2">{item.description}</p>}
            <div className="flex flex-wrap gap-1">
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">{item.clothing_type}</span>
              {item.material && (
                <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">{item.material}</span>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Кастомное название */}
          <div className="space-y-2">
            <Label htmlFor="customName" className="text-sm font-medium text-gray-700">
              Название (необязательно)
            </Label>
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
            <Label htmlFor="size" className="text-sm font-medium text-gray-700">
              Размер *
            </Label>
            <Select value={formData.size} onValueChange={(value) => setFormData({ ...formData, size: value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-xl h-12">
                <SelectValue placeholder="Выберите размер" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="XS">XS</SelectItem>
                <SelectItem value="S">S</SelectItem>
                <SelectItem value="M">M</SelectItem>
                <SelectItem value="L">L</SelectItem>
                <SelectItem value="XL">XL</SelectItem>
                <SelectItem value="XXL">XXL</SelectItem>
                <SelectItem value="36">36</SelectItem>
                <SelectItem value="38">38</SelectItem>
                <SelectItem value="40">40</SelectItem>
                <SelectItem value="42">42</SelectItem>
                <SelectItem value="44">44</SelectItem>
                <SelectItem value="46">46</SelectItem>
                <SelectItem value="48">48</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Материал */}
          <div className="space-y-2">
            <Label htmlFor="material" className="text-sm font-medium text-gray-700">
              Материал
            </Label>
            <Input
              id="material"
              value={formData.material}
              onChange={(e) => setFormData({ ...formData, material: e.target.value })}
              placeholder={item.material || "Например: хлопок, шерсть, полиэстер"}
              className="bg-white border-gray-300 rounded-xl h-12"
            />
          </div>

          {/* Стиль */}
          <div className="space-y-2">
            <Label htmlFor="style" className="text-sm font-medium text-gray-700">
              Стиль
            </Label>
            <Input
              id="style"
              value={formData.style}
              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
              placeholder={item.style || "Например: классический, спортивный, casual"}
              className="bg-white border-gray-300 rounded-xl h-12"
            />
          </div>

          {/* Цвет */}
          <div className="space-y-2">
            <Label htmlFor="color" className="text-sm font-medium text-gray-700">
              Цвет
            </Label>
            <Input
              id="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              placeholder={item.color || "Например: черный, белый, синий"}
              className="bg-white border-gray-300 rounded-xl h-12"
            />
          </div>

          {/* Заметки */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
              Заметки
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Дополнительная информация о вещи..."
              className="bg-white border-gray-300 rounded-xl min-h-[80px] resize-none"
            />
          </div>

          {/* Кнопки */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-12 rounded-xl border-gray-300 bg-transparent"
              disabled={isLoading}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 rounded-xl bg-gray-800 hover:bg-gray-900"
              disabled={isLoading || !formData.size}
            >
              {isLoading ? "Добавление..." : "Добавить в гардероб"}
            </Button>
          </div>
        </form>
      </div>
    </CommonSheet>
  )
}
