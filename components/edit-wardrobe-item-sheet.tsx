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
import { Shirt } from "lucide-react"
import { CommonSheet } from "./common-sheet"
import {api} from "@/lib/api-client";

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
  "Полиэстер",
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

const CLOTHING_TYPES = [
  "Футболка",
  "Рубашка",
  "Блузка",
  "Свитер",
  "Худи",
  "Куртка",
  "Пальто",
  "Пиджак",
  "Жилет",
  "Платье",
  "Юбка",
  "Брюки",
  "Джинсы",
  "Шорты",
  "Костюм",
  "Комбинезон",
  "Кардиган",
  "Жакет",
  "Ветровка",
  "Пуховик",
  "Тренч",
  "Свитшот",
  "Топ",
  "Боди",
  "Леггинсы",
  "Спортивные штаны",
  "Кроссовки",
  "Туфли",
  "Ботинки",
  "Сапоги",
  "Сандалии",
  "Кеды",
  "Сумка",
  "Рюкзак",
  "Шарф",
  "Шапка",
  "Перчатки",
  "Ремень",
  "Очки",
  "Часы",
  "Украшение",
]

const GENDER_OPTIONS = ["male", "female", "unisex"] as const

export function EditWardrobeItemSheet({ item, isOpen, onClose, onSuccess }: EditWardrobeItemSheetProps) {
  const [formData, setFormData] = useState({
    size_type: "",
    material: "",
    style: "",
    clothing_type: "",
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
  const [clothingTypes, setClothingTypes] = useState<string[]>(CLOTHING_TYPES)

  // Значение из БД может прийти в любом регистре ("нейлон" vs справочное
  // "Нейлон") — раньше addToListIfNotExists сравнивала строки как есть и
  // добавляла дубль вместо того, чтобы узнать уже существующий пункт. Теперь
  // сопоставляем без учёта регистра и возвращаем канонический вариант списка,
  // чтобы Select показывал ровно один читаемый пункт как выбранный.
  const mergeAndResolveValue = (
    baseList: string[],
    value: string | undefined,
  ): { list: string[]; resolved: string } => {
    const trimmedValue = (value ?? "").trim()
    if (!trimmedValue) return { list: baseList, resolved: "" }
    const existing = baseList.find((option) => option.toLowerCase() === trimmedValue.toLowerCase())
    if (existing) return { list: baseList, resolved: existing }
    return { list: [...baseList, trimmedValue].sort(), resolved: trimmedValue }
  }

  // Загрузка данных при открытии шторки
  useEffect(() => {
    if (isOpen && item) {
      const sizesResolved = mergeAndResolveValue(BASE_SIZES, item.size_type)
      const shadesResolved = mergeAndResolveValue(BASE_SHADES, item.shade)
      const materialsResolved = mergeAndResolveValue(BASE_MATERIALS, item.material)
      const stylesResolved = mergeAndResolveValue(BASE_STYLES, item.style)
      const clothingTypesResolved = mergeAndResolveValue(CLOTHING_TYPES, item.clothing_type)

      setSizes(sizesResolved.list)
      setShades(shadesResolved.list)
      setMaterials(materialsResolved.list)
      setStyles(stylesResolved.list)
      setClothingTypes(clothingTypesResolved.list)

      setFormData({
        size_type: sizesResolved.resolved,
        material: materialsResolved.resolved,
        style: stylesResolved.resolved,
        clothing_type: clothingTypesResolved.resolved,
        has_print: item.has_print === true || item.has_print === "true",
        shade: shadesResolved.resolved,
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
      const submitData: Record<string, string | null> = {
        size_type: formData.size_type || null,
        material: formData.material || null,
        style: formData.style || null,
        clothing_type: formData.clothing_type || null,
        has_print: formData.has_print ? "true" : "false",
        shade: formData.shade || null,
        url: formData.url || null,
        notes: formData.notes || null,
        gender: formData.gender || null,
      }

      await api.put(`/api/wardrobe/${item.id}`, submitData)

      // Log user corrections for model retraining
      const corrections: Record<string, { from: string | undefined; to: string | null }> = {}
      if (formData.clothing_type && formData.clothing_type !== (item.clothing_type || "")) {
        corrections.clothing_type = { from: item.clothing_type, to: formData.clothing_type }
      }
      if (formData.style && formData.style !== (item.style || "")) {
        corrections.style = { from: item.style, to: formData.style }
      }
      if (Object.keys(corrections).length > 0) {
        api.post("/api/usage/log", {
          feature: "wardrobe_items_anlyzed",
          action: "click",
          count: 1,
          meta: { item_id: item.id, event: "item_correction", corrections },
        }).catch(() => {}) // fire and forget
      }

      toast.success("Вещь успешно обновлена!")
      onSuccess?.()
      onClose()
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

  const selectTriggerClassName = "h-12 rounded-full border-transparent bg-canvas-sunk text-[15px] text-ink"

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Редактировать вещь" backgroundColor="white">
      <div className="flex flex-col h-full">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Мобильная версия - фото сверху */}
            <div className="block md:hidden">
              <div className="flex flex-col items-center mb-6">
                <div className="w-40 h-40 bg-canvas-sunk rounded-lg overflow-hidden flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Shirt className="h-10 w-10 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                  )}
                </div>
                <p className="text-ink text-sm mt-2 text-center font-medium">{item.item_name}</p>
              </div>

              {/* Поля формы */}
              <div className="space-y-4">
                {/* Тип одежды */}
                <div className="space-y-2">
                  <Label className="text-ink-2">Тип одежды</Label>
                  <Select value={formData.clothing_type} onValueChange={(value) => handleInputChange("clothing_type", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {clothingTypes.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {ct}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Размер */}
                <div className="space-y-2">
                  <Label className="text-ink-2">Размер</Label>
                  <Select value={formData.size_type} onValueChange={(value) => handleInputChange("size_type", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
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
                  <Label className="text-ink-2">Оттенок</Label>
                <Select value={formData.shade} onValueChange={(value) => handleInputChange("shade", value)}>
                  <SelectTrigger className={selectTriggerClassName}>
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
                <Label className="text-ink-2">Пол</Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                  <SelectTrigger className={selectTriggerClassName}>
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
                <Label className="text-ink-2">Материал</Label>
                  <Select value={formData.material} onValueChange={(value) => handleInputChange("material", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
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
                  <Label className="text-ink-2">Стиль</Label>
                  <Select value={formData.style} onValueChange={(value) => handleInputChange("style", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
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
                <Label className="text-ink-2 mb-2">Фото</Label>
                <div className="w-full max-w-48 aspect-square bg-canvas-sunk rounded-lg overflow-hidden flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Shirt className="h-10 w-10 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                  )}
                </div>
                <p className="text-ink text-sm mt-2 text-center font-medium">{item.item_name}</p>
              </div>

              {/* Поля справа - 50% */}
              <div className="flex-1 space-y-4">
                {/* Тип одежды */}
                <div className="space-y-2">
                  <Label className="text-ink-2">Тип одежды</Label>
                  <Select value={formData.clothing_type} onValueChange={(value) => handleInputChange("clothing_type", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {clothingTypes.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {ct}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Размер */}
                <div className="space-y-2">
                  <Label className="text-ink-2">Размер</Label>
                  <Select value={formData.size_type} onValueChange={(value) => handleInputChange("size_type", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
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
                  <Label className="text-ink-2">Оттенок</Label>
                <Select value={formData.shade} onValueChange={(value) => handleInputChange("shade", value)}>
                  <SelectTrigger className={selectTriggerClassName}>
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
                <Label className="text-ink-2">Пол</Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange("gender", value)}>
                  <SelectTrigger className={selectTriggerClassName}>
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
                <Label className="text-ink-2">Материал</Label>
                  <Select value={formData.material} onValueChange={(value) => handleInputChange("material", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
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
                  <Label className="text-ink-2">Стиль</Label>
                  <Select value={formData.style} onValueChange={(value) => handleInputChange("style", value)}>
                    <SelectTrigger className={selectTriggerClassName}>
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
              />
              <Label htmlFor="has_print" className="text-ink-2">
                Есть принт
              </Label>
            </div>

            {/* Ссылка на товар */}
            <div className="space-y-2">
              <Label htmlFor="url" className="text-ink-2">
                Ссылка на товар в магазине
              </Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => handleInputChange("url", e.target.value)}
                placeholder="https://shop.com/product/123"
              />
            </div>

            {/* Заметки */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-ink-2">
                Заметки
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                placeholder="Дополнительная информация о вещи"
                rows={3}
                className="min-h-[88px] rounded-2xl border-transparent bg-canvas-sunk text-[15px] text-ink placeholder:text-ink-3"
              />
            </div>

            {/* Кнопки для десктопа */}
            <div className="hidden md:flex gap-4 pt-4">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Обновление..." : "Обновить"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Отмена
              </Button>
            </div>
          </form>
        </div>

        {/* Fixed bottom buttons for mobile */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-canvas border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Отмена
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading} className="flex-1">
              {isLoading ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </CommonSheet>
  )
}
