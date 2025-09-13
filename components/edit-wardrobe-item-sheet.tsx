"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { CommonSheet } from "./common-sheet"

interface WardrobeItem {
  id: number
  item_name: string
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string | boolean
  has_details?: string
  size_type?: string
  notes?: string
  image_url?: string
  clothing_type?: string
  created_at?: string
  basic_item_id?: number
  url?: string
  gender?: string
}

interface EditWardrobeItemSheetProps {
  item: WardrobeItem | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const BASE_SIZES = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "52",
  "54",
  "56",
  "58",
  "60",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "38",
]

const BASE_SHADES = ["Светлый", "Темный", "Яркий", "Приглушенный", "Насыщенный", "Бледный", "Глубокий", "Мягкий"]

const BASE_MATERIALS = [
  "Хлопок",
  "Лен",
  "Шерсть",
  "Кашемир",
  "Шелк",
  "Поли��стер",
  "Нейлон",
  "Спандекс",
  "Эластан",
  "Вискоза",
  "Акрил",
  "Джинса",
  "Кожа",
  "Замша",
  "Мех",
  "Трикотаж",
]

const BASE_STYLES = [
  "Классический",
  "Спортивный",
  "Casual",
  "Деловой",
  "Вечерний",
  "Романтический",
  "Минималистичный",
  "Бохо",
  "Винтаж",
  "Гранж",
  "Preppy",
  "Уличный",
]

const GENDER_OPTIONS = ["male", "female", "unisex"] as const

export function EditWardrobeItemSheet({ item, isOpen, onClose, onSuccess }: EditWardrobeItemSheetProps) {
  const [formData, setFormData] = useState({
    size_type: "",
    material: "",
    style: "",
    has_print: false,
    shade: "",
    url: "",
    notes: "",
    gender: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [sizes, setSizes] = useState<string[]>(BASE_SIZES)
  const [shades, setShades] = useState<string[]>(BASE_SHADES)
  const [materials, setMaterials] = useState<string[]>(BASE_MATERIALS)
  const [styles, setStyles] = useState<string[]>(BASE_STYLES)

  // Функция для добавления значения в список, если его там нет
  const addToListIfNotExists = (list: string[], value: string | undefined): string[] => {
    if (!value || value.trim() === "") return list
    const trimmedValue = value.trim()
    if (!list.includes(trimmedValue)) {
      return [...list, trimmedValue].sort()
    }
    return list
  }

  // Загрузка данных при открытии шторки
  useEffect(() => {
    if (isOpen && item) {
      // Обновляем списки, добавляя текущие значения если их нет
      setSizes(addToListIfNotExists(BASE_SIZES, item.size_type))
      setShades(addToListIfNotExists(BASE_SHADES, item.shade))
      setMaterials(addToListIfNotExists(BASE_MATERIALS, item.material))
      setStyles(addToListIfNotExists(BASE_STYLES, item.style))

      setFormData({
        size_type: item.size_type || "",
        material: item.material || "",
        style: item.style || "",
        has_print: item.has_print === true || item.has_print === "true",
        shade: item.shade || "",
        url: item.url || "",
        notes: item.notes || "",
        gender: item.gender || "",
      })
    }
  }, [isOpen, item])

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!item) {
      toast.error("Ошибка: вещь не найдена")
      return
    }

    setIsLoading(true)

    try {
      // Подготовка данных для отправки
      const submitData = {
        size_type: formData.size_type || null,
        material: formData.material || null,
        style: formData.style || null,
        has_print: formData.has_print ? "true" : "false",
        shade: formData.shade || null,
        url: formData.url || null,
        notes: formData.notes || null,
        gender: formData.gender || null,
      }

      const response = await fetch(`/api/wardrobe/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      })

      if (response.ok) {
        toast.success("Вещь успешно обновлена!")
        onSuccess?.()
        onClose()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update item")
      }
    } catch (error) {
      console.error("Error updating item:", error)
      toast.error("Ошибка при обновлении вещи")
    } finally {
      setIsLoading(false)
    }
  }

  // Если item равен null, не рендерим компонент
  if (!item) {
    return null
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Редактировать вещь" backgroundColor="dark">
      <div className="flex flex-col h-full">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Мобильная версия - фото сверху */}
            <div className="block md:hidden">
              <div className="flex flex-col items-center mb-6">
                <div className="w-40 h-40 bg-gray-600 rounded-lg overflow-hidden flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">👕</span>
                  )}
                </div>
                <p className="text-white text-sm mt-2 text-center font-medium">{item.item_name}</p>
              </div>

              {/* Поля формы */}
              <div className="space-y-4">
                {/* Размер */}
                <div className="space-y-2">
                  <Label className="text-white">Размер</Label>
                  <Select value={formData.size_type} onValueChange={(value) => handleInputChange("size_type", value)}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Выберите размер" />
                    </SelectTrigger>
                    <SelectContent>
                      {sizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Оттенок */}
                <div className="space-y-2">
                  <Label className="text-white">Оттенок</Label>
                <Select value={formData.shade} onValueChange={(value) => handleInputChange("shade", value)}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Выберите оттенок" />
                  </SelectTrigger>
                  <SelectContent>
                    {shades.map((shade) => (
                      <SelectItem key={shade} value={shade}>
                        {shade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Пол */}
              <div className="space-y-2">
                <Label className="text-white">Пол</Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Выберите пол" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g === "male" ? "Мужской" : g === "female" ? "Женский" : "Унисекс"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Материал */}
              <div className="space-y-2">
                <Label className="text-white">Материал</Label>
                  <Select value={formData.material} onValueChange={(value) => handleInputChange("material", value)}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Выберите материал" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((material) => (
                        <SelectItem key={material} value={material}>
                          {material}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Стиль */}
                <div className="space-y-2">
                  <Label className="text-white">Стиль</Label>
                  <Select value={formData.style} onValueChange={(value) => handleInputChange("style", value)}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Выберите стиль" />
                    </SelectTrigger>
                    <SelectContent>
                      {styles.map((style) => (
                        <SelectItem key={style} value={style}>
                          {style}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Планшеты и десктопы - 50/50 */}
            <div className="hidden md:flex gap-6">
              {/* Фото слева - 50% */}
              <div className="flex-1 flex flex-col items-center">
                <Label className="text-white mb-2">Фото</Label>
                <div className="w-full max-w-48 aspect-square bg-gray-600 rounded-lg overflow-hidden flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">👕</span>
                  )}
                </div>
                <p className="text-white text-sm mt-2 text-center font-medium">{item.item_name}</p>
              </div>

              {/* Поля справа - 50% */}
              <div className="flex-1 space-y-4">
                {/* Размер */}
                <div className="space-y-2">
                  <Label className="text-white">Размер</Label>
                  <Select value={formData.size_type} onValueChange={(value) => handleInputChange("size_type", value)}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Выберите размер" />
                    </SelectTrigger>
                    <SelectContent>
                      {sizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Оттенок */}
                <div className="space-y-2">
                  <Label className="text-white">Оттенок</Label>
                <Select value={formData.shade} onValueChange={(value) => handleInputChange("shade", value)}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Выберите оттенок" />
                  </SelectTrigger>
                  <SelectContent>
                    {shades.map((shade) => (
                      <SelectItem key={shade} value={shade}>
                        {shade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Пол */}
              <div className="space-y-2">
                <Label className="text-white">Пол</Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue placeholder="Выберите пол" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g === "male" ? "Мужской" : g === "female" ? "Женский" : "Унисекс"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Материал */}
              <div className="space-y-2">
                <Label className="text-white">Материал</Label>
                  <Select value={formData.material} onValueChange={(value) => handleInputChange("material", value)}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Выберите материал" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((material) => (
                        <SelectItem key={material} value={material}>
                          {material}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Стиль */}
                <div className="space-y-2">
                  <Label className="text-white">Стиль</Label>
                  <Select value={formData.style} onValueChange={(value) => handleInputChange("style", value)}>
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Выберите стиль" />
                    </SelectTrigger>
                    <SelectContent>
                      {styles.map((style) => (
                        <SelectItem key={style} value={style}>
                          {style}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Принт */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="has_print"
                checked={formData.has_print}
                onCheckedChange={(checked) => handleInputChange("has_print", checked as boolean)}
                className="border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
              />
              <Label htmlFor="has_print" className="text-white">
                Есть принт
              </Label>
            </div>

            {/* Ссылка на товар */}
            <div className="space-y-2">
              <Label htmlFor="url" className="text-white">
                Ссылка на товар в магазине
              </Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => handleInputChange("url", e.target.value)}
                placeholder="https://shop.com/product/123"
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>

            {/* Заметки */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-white">
                Заметки
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                placeholder="Дополнительная информация о вещи"
                rows={3}
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>

            {/* Кнопки для десктопа */}
            <div className="hidden md:flex gap-4 pt-4">
              <Button type="submit" disabled={isLoading} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white">
                {isLoading ? "Обновление..." : "Обновить"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-gray-600 text-white hover:bg-gray-700 bg-transparent"
              >
                Отмена
              </Button>
            </div>
          </form>
        </div>

        {/* Fixed bottom buttons for mobile */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-600 p-4 z-50">
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-600 text-white hover:bg-gray-700 bg-transparent"
            >
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 bg-gray-900 hover:bg-gray-800 text-white"
            >
              {isLoading ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </CommonSheet>
  )
}
