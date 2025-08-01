"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { CommonSheet } from "./common-sheet"
import { toast } from "sonner"

interface WardrobeItem {
  id: number
  item_name: string
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string
  size_type?: string
  notes?: string
  image_url?: string
  clothing_type?: string
  shop_url?: string
}

interface EditWardrobeItemSheetProps {
  item: WardrobeItem
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60"]

const SHADES = [
  "светлый",
  "тёмный",
  "яркий",
  "приглушённый",
  "насыщенный",
  "бледный",
  "глубокий",
  "мягкий",
  "интенсивный",
  "пастельный",
]

const MATERIALS = [
  "хлопок",
  "лён",
  "шерсть",
  "кашемир",
  "шёлк",
  "полиэстер",
  "нейлон",
  "спандекс",
  "эластан",
  "вискоза",
  "акрил",
  "джинса",
  "кожа",
  "замша",
  "мех",
  "флис",
  "трикотаж",
]

const STYLES = [
  "классический",
  "casual",
  "спортивный",
  "деловой",
  "вечерний",
  "повседневный",
  "винтажный",
  "современный",
  "минималистичный",
  "романтичный",
  "гранж",
  "бохо",
  "этнический",
  "авангардный",
  "ретро",
]

export function EditWardrobeItemSheet({ item, isOpen, onClose, onSuccess }: EditWardrobeItemSheetProps) {
  const [formData, setFormData] = useState({
    size_type: "",
    shade: "",
    material: "",
    style: "",
    has_print: false,
    notes: "",
    shop_url: "",
  })
  const [isSaving, setIsSaving] = useState(false)

  // Создаем расширенные списки с текущими значениями
  const [availableSizes, setAvailableSizes] = useState(SIZES)
  const [availableShades, setAvailableShades] = useState(SHADES)
  const [availableMaterials, setAvailableMaterials] = useState(MATERIALS)
  const [availableStyles, setAvailableStyles] = useState(STYLES)

  useEffect(() => {
    if (isOpen && item) {
      // Добавляем текущие значения в списки, если их там нет
      const currentSizes = [...SIZES]
      if (item.size_type && !currentSizes.includes(item.size_type)) {
        currentSizes.push(item.size_type)
      }
      setAvailableSizes(currentSizes)

      const currentShades = [...SHADES]
      if (item.shade && !currentShades.includes(item.shade)) {
        currentShades.push(item.shade)
      }
      setAvailableShades(currentShades)

      const currentMaterials = [...MATERIALS]
      if (item.material && !currentMaterials.includes(item.material)) {
        currentMaterials.push(item.material)
      }
      setAvailableMaterials(currentMaterials)

      const currentStyles = [...STYLES]
      if (item.style && !currentStyles.includes(item.style)) {
        currentStyles.push(item.style)
      }
      setAvailableStyles(currentStyles)

      setFormData({
        size_type: item.size_type || "",
        shade: item.shade || "",
        material: item.material || "",
        style: item.style || "",
        has_print: item.has_print === "да" || item.has_print === "есть",
        notes: item.notes || "",
        shop_url: item.shop_url || "",
      })
    }
  }, [isOpen, item])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/wardrobe-user-items/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          size_type: formData.size_type || null,
          shade: formData.shade || null,
          material: formData.material || null,
          style: formData.style || null,
          has_print: formData.has_print ? "да" : "нет",
          notes: formData.notes || null,
          shop_url: formData.shop_url || null,
        }),
      })

      if (response.ok) {
        toast.success("Вещь успешно обновлена")
        onSuccess()
        onClose()
      } else {
        throw new Error("Failed to update item")
      }
    } catch (error) {
      console.error("Error updating item:", error)
      toast.error("Ошибка при обновлении вещи")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Редактировать вещь" backgroundColor="dark">
      <div className="flex gap-6">
        {/* Фото слева */}
        <div className="flex-shrink-0">
          <div className="w-32 h-32 bg-gray-600 rounded-lg overflow-hidden flex items-center justify-center">
            {item.image_url ? (
              <img
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = "none"
                  target.nextElementSibling?.classList.remove("hidden")
                }}
              />
            ) : null}
            <span className={`text-4xl ${item.image_url ? "hidden" : ""}`}>👕</span>
          </div>
          <p className="text-white text-sm mt-2 text-center font-medium">{item.item_name}</p>
        </div>

        {/* Форма справа */}
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Размер</Label>
            <Select
              value={formData.size_type}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, size_type: value }))}
            >
              <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Выберите размер" />
              </SelectTrigger>
              <SelectContent>
                {availableSizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Оттенок</Label>
            <Select
              value={formData.shade}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, shade: value }))}
            >
              <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Выберите оттенок" />
              </SelectTrigger>
              <SelectContent>
                {availableShades.map((shade) => (
                  <SelectItem key={shade} value={shade}>
                    {shade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Материал</Label>
            <Select
              value={formData.material}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, material: value }))}
            >
              <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Выберите материал" />
              </SelectTrigger>
              <SelectContent>
                {availableMaterials.map((material) => (
                  <SelectItem key={material} value={material}>
                    {material}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Стиль</Label>
            <Select
              value={formData.style}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, style: value }))}
            >
              <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Выберите стиль" />
              </SelectTrigger>
              <SelectContent>
                {availableStyles.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="has_print"
              checked={formData.has_print}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, has_print: !!checked }))}
              className="border-gray-400"
            />
            <Label htmlFor="has_print" className="text-white">
              Есть принт
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Заметки</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Дополнительные заметки о вещи..."
              className="bg-white border-gray-300 text-gray-900"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Ссылка на товар</Label>
            <Input
              type="url"
              value={formData.shop_url}
              onChange={(e) => setFormData((prev) => ({ ...prev, shop_url: e.target.value }))}
              placeholder="https://example.com/product"
              className="bg-white border-gray-300 text-gray-900"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-transparent border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white hover:border-gray-400"
            >
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-gray-900 hover:bg-gray-800 text-white border-0"
            >
              {isSaving ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </CommonSheet>
  )
}
