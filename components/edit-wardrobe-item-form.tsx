"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"
import { toast } from "sonner"
import { ColorPicker } from "./color-picker"
import { useRouter } from "next/navigation"
import {api} from "@/lib/api-client";

const CLOTHING_TYPES = [
  "верхняя",
  "нижняя",
  "платье",
  "комбинезон",
  "верхняя одежда",
  "обувь",
  "аксессуар",
  "часы",
  "головной убор",
  "спорт",
] as const

const GENDER_OPTIONS = ["male", "female", "unisex"] as const

interface EditWardrobeItemFormProps {
  item: any
}

export function EditWardrobeItemForm({ item }: EditWardrobeItemFormProps) {
  const [formData, setFormData] = useState({
    item_name: item?.item_name || "",
    item_name_en: item?.item_name_en || "",
    description: item?.description || "",
    description_en: item?.description_en || "",
    size_type: item?.size_type || "",
    material: item?.material || "",
    style: item?.style || "",
    has_print: item?.has_print || false,
    color: item?.color || "",
    shade: item?.shade || "",
    has_details: item?.has_details || false,
    store_url: item?.url || "",
    notes: item?.notes || "",
    basic_item_id: item?.basic_item_id ? String(item.basic_item_id) : "none",
    clothing_type: item?.clothing_type || "",
    gender: item?.gender || "",
  })

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url || null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [basicItems, setBasicItems] = useState([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    void loadBasicItems()
  }, [])

  const loadBasicItems = async () => {
    try {
      const data = await api.get("/api/basic-wardrobe-items")
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setBasicItems(arr)
    } catch (error) {
      console.error("Error loading basic items:", error)
      setBasicItems([])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type.startsWith("image/")) {
        handleFileSelect(file)
      } else {
        toast.error("Пожалуйста, выберите изображение")
      }
    }
  }

  const handleFileSelect = (file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleImageError = () => {
    console.log("[v0] Image failed to load, clearing preview")
    setImagePreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.item_name.trim()) {
      toast.error("Название вещи обязательно для заполнения")
      return
    }

    if (!formData.store_url.trim()) {
      toast.error("Ссылка на товар в магазине обязательна для заполнения")
      return
    }

    setIsLoading(true)
    try {
      let imageUrl = item?.image_url || ""

      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploaded = await api.post("/api/upload-image", fd )
        imageUrl = uploaded.url
      }

      const submitData = {
        item_name: formData.item_name,
        item_name_en: formData.item_name_en || null,
        description: formData.description || null,
        description_en: formData.description_en || null,
        size_type: formData.size_type || null,
        material: formData.material || null,
        style: formData.style || null,
        has_print: formData.has_print,
        color: formData.color || null,
        shade: formData.shade || null,
        has_details: formData.has_details,
        image_url: imageUrl,
        url: formData.store_url || null,
        notes: formData.notes || null,
        basic_item_id: formData.basic_item_id === "none" ? null : Number.parseInt(formData.basic_item_id),
        clothing_type: formData.clothing_type || null,
        gender: formData.gender || null,
      }

      const res = await api.put(`/api/wardrobe/${item.id}`, submitData)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to update item")
      }

      toast.success("Вещь успешно обновлена")
      router.push("/admin/wardrobe")
    } catch (error) {
      console.error("Error updating item:", error)
      toast.error("Ошибка при обновлении вещи")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Редактировать вещь</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label>Фото вещи</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview || "/placeholder.svg"}
                      alt="Preview"
                      className="w-full max-h-80 object-contain rounded-lg bg-gray-50"
                      onError={handleImageError}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={removeImage}
                      className="absolute top-2 right-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">Перетащите изображение сюда или</p>
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                        Выбрать фото
                      </Button>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Form fields */}
            <div>
              <Label htmlFor="item_name">Название вещи *</Label>
              <Input
                id="item_name"
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                placeholder="Например: Белая рубашка"
                required
              />
            </div>

            <div>
              <Label htmlFor="item_name_en">Название на английском</Label>
              <Input
                id="item_name_en"
                value={formData.item_name_en}
                onChange={(e) => setFormData({ ...formData, item_name_en: e.target.value })}
                placeholder="English name"
              />
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Описание вещи"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="description_en">Описание на английском</Label>
              <Textarea
                id="description_en"
                value={formData.description_en}
                onChange={(e) => setFormData({ ...formData, description_en: e.target.value })}
                placeholder="English description"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="clothing_type">Тип одежды</Label>
              <Select
                value={formData.clothing_type}
                onValueChange={(value) => setFormData({ ...formData, clothing_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип одежды" />
                </SelectTrigger>
                <SelectContent>
                  {CLOTHING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="gender">Пол</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger id="gender">
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

            <div className="space-y-2">
              <Label htmlFor="size_type">Размер</Label>
              <Input
                id="size_type"
                value={formData.size_type}
                onChange={(e) => setFormData({ ...formData, size_type: e.target.value })}
                placeholder="Например: M, 42, L"
              />
            </div>

            <div className="space-y-2">
              <Label>Цвет</Label>
              <ColorPicker
                value={formData.color}
                onChange={(color) => setFormData({ ...formData, color: color })}
                imagePreview={imagePreview}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shade">Оттенок</Label>
              <Input
                id="shade"
                value={formData.shade}
                onChange={(e) => setFormData({ ...formData, shade: e.target.value })}
                placeholder="Например: светлый, темный, яркий"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="material">Материал</Label>
              <Input
                id="material"
                value={formData.material}
                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                placeholder="Например: хлопок, шерсть, полиэстер"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="style">Стиль</Label>
              <Input
                id="style"
                value={formData.style}
                onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                placeholder="Например: классический, спортивный, casual"
              />
            </div>

            <div className="space-y-4">
              <Label>Характеристики</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has_print"
                  checked={formData.has_print}
                  onCheckedChange={(checked) => setFormData({ ...formData, has_print: checked as boolean })}
                />
                <Label htmlFor="has_print">Есть принт</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="has_details"
                  checked={formData.has_details}
                  onCheckedChange={(checked) => setFormData({ ...formData, has_details: checked as boolean })}
                />
                <Label htmlFor="has_details">Есть детали</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Базовая вещь</Label>
              <Select
                value={formData.basic_item_id}
                onValueChange={(value) => setFormData({ ...formData, basic_item_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите базовую вещь" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не выбрано</SelectItem>
                  {basicItems.map((item: any) => {
                    const name = item.item_name || item.name_ru || item.name_en || "Без названия"
                    return (
                      <SelectItem key={item.id} value={String(item.id)}>
                        <div className="flex items-center gap-2">
                          {item.image_url ? (
                            <img
                              src={item.image_url || "/placeholder.svg"}
                              alt={name}
                              className="w-6 h-6 rounded object-cover border"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded bg-gray-100 border" />
                          )}
                          <span className="truncate">{name}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="store_url">Ссылка на товар в магазине *</Label>
              <Input
                id="store_url"
                type="url"
                value={formData.store_url}
                onChange={(e) => setFormData({ ...formData, store_url: e.target.value })}
                placeholder="https://shop.com/product/123"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Заметки</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Дополнительная информация о вещи"
                rows={3}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Обновление..." : "Обновить вещь"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/admin/wardrobe")}>
                Отмена
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
