"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Upload, X } from "lucide-react"
import Image from "next/image"
import { ColorPicker } from "./color-picker"

interface BasicWardrobeItem {
  id: number
  name_ru: string
  name_en: string
  description: string
  image_url: string
}

interface AddWardrobeItemFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  editingItem?: any
}

export function AddWardrobeItemForm({ onSuccess, onCancel, editingItem }: AddWardrobeItemFormProps) {
  const [formData, setFormData] = useState({
    item_name: "",
    size_type: "",
    color: "#808080",
    shade: "",
    material: "",
    style: "",
    notes: "",
    has_print: false,
    has_details: false,
    basic_item_id: "0",
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicWardrobeItem[]>([])
  const [loadingBasicItems, setLoadingBasicItems] = useState(true)
  const { toast } = useToast()

  // Загружаем базовые вещи при монтировании компонента
  useEffect(() => {
    const fetchBasicItems = async () => {
      try {
        const response = await fetch("/api/basic-wardrobe-items")
        if (response.ok) {
          const data = await response.json()
          setBasicItems(data.items || [])
        } else {
          console.error("Failed to fetch basic items")
        }
      } catch (error) {
        console.error("Error fetching basic items:", error)
      } finally {
        setLoadingBasicItems(false)
      }
    }

    fetchBasicItems()
  }, [])

  // Заполняем форму при редактировании
  useEffect(() => {
    if (editingItem) {
      setFormData({
        item_name: editingItem.item_name || "",
        size_type: editingItem.size_type || "",
        color: editingItem.color || "#808080",
        shade: editingItem.shade || "",
        material: editingItem.material || "",
        style: editingItem.style || "",
        notes: editingItem.notes || "",
        has_print: editingItem.has_print || false,
        has_details: editingItem.has_details || false,
        basic_item_id: editingItem.basic_item_id?.toString() || "0",
      })
      if (editingItem.image_url) {
        setImagePreview(editingItem.image_url)
      }
    }
  }, [editingItem])

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.item_name.trim()) {
      toast({
        title: "Ошибка",
        description: "Название вещи обязательно",
        variant: "destructive",
      })
      return
    }

    // Проверяем валидность HEX цвета
    if (formData.color && !/^#[0-9A-Fa-f]{6}$/.test(formData.color)) {
      toast({
        title: "Ошибка",
        description: "Цвет должен быть в формате HEX (#RRGGBB)",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      let imageUrl = imagePreview

      // Загружаем изображение если выбрано новое
      if (imageFile) {
        const imageFormData = new FormData()
        imageFormData.append("file", imageFile)

        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          body: imageFormData,
        })

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json()
          imageUrl = uploadData.url
        } else {
          throw new Error("Failed to upload image")
        }
      }

      // Подготавливаем данные для отправки
      const submitData = {
        ...formData,
        image_url: imageUrl,
        color: formData.color.toUpperCase(), // Приводим к верхнему регистру
        basic_item_id:
          formData.basic_item_id && formData.basic_item_id !== "0" ? Number.parseInt(formData.basic_item_id) : null,
      }

      const method = editingItem ? "PUT" : "POST"
      const url = editingItem ? `/api/wardrobe/${editingItem.id}` : "/api/wardrobe"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      })

      if (response.ok) {
        toast({
          title: editingItem ? "Вещь обновлена" : "Вещь добавлена",
          description: `Вещь "${formData.item_name}" успешно ${editingItem ? "обновлена" : "добавлена"}`,
        })

        // Сбрасываем форму
        setFormData({
          item_name: "",
          size_type: "",
          color: "#808080",
          shade: "",
          material: "",
          style: "",
          notes: "",
          has_print: false,
          has_details: false,
          basic_item_id: "0",
        })
        setImageFile(null)
        setImagePreview("")

        onSuccess?.()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save item")
      }
    } catch (error) {
      console.error("Error saving item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить вещь",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Изображение */}
      <div className="space-y-2">
        <Label>Изображение</Label>
        {imagePreview ? (
          <div className="relative w-32 h-32">
            <Image
              src={imagePreview || "/placeholder.svg"}
              alt="Preview"
              fill
              className="object-cover rounded-lg"
              sizes="128px"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
              onClick={removeImage}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-2">
              <Label htmlFor="image-upload" className="cursor-pointer text-blue-600 hover:text-blue-500">
                Выберите изображение
              </Label>
              <Input id="image-upload" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </div>
          </div>
        )}
      </div>

      {/* Основная информация */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="item_name">Название вещи *</Label>
          <Input
            id="item_name"
            value={formData.item_name}
            onChange={(e) => handleInputChange("item_name", e.target.value)}
            placeholder="Например: Белая рубашка"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="size_type">Размер</Label>
          <Input
            id="size_type"
            value={formData.size_type}
            onChange={(e) => handleInputChange("size_type", e.target.value)}
            placeholder="Например: M, 42, L"
          />
        </div>
      </div>

      {/* Цвет и оттенок */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ColorPicker
          label="Цвет *"
          value={formData.color}
          onChange={(color) => handleInputChange("color", color)}
          placeholder="#808080"
          imagePreview={imagePreview}
        />

        <div className="space-y-2">
          <Label htmlFor="shade">Оттенок</Label>
          <Input
            id="shade"
            value={formData.shade}
            onChange={(e) => handleInputChange("shade", e.target.value)}
            placeholder="Например: Молочный"
          />
        </div>
      </div>

      {/* Материал и стиль */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="material">Материал</Label>
          <Input
            id="material"
            value={formData.material}
            onChange={(e) => handleInputChange("material", e.target.value)}
            placeholder="Например: Хлопок"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="style">Стиль</Label>
          <Input
            id="style"
            value={formData.style}
            onChange={(e) => handleInputChange("style", e.target.value)}
            placeholder="Например: Классический"
          />
        </div>
      </div>

      {/* Базовая вещь */}
      <div className="space-y-2">
        <Label htmlFor="basic_item_id">Базовая вещь (опционально)</Label>
        <Select
          value={formData.basic_item_id}
          onValueChange={(value) => handleInputChange("basic_item_id", value)}
          disabled={loadingBasicItems}
        >
          <SelectTrigger>
            <SelectValue placeholder={loadingBasicItems ? "Загрузка..." : "Выберите базовую вещь"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                  <X className="w-3 h-3 text-gray-400" />
                </div>
                <span>Не выбрано</span>
              </div>
            </SelectItem>
            {basicItems.map((item) => (
              <SelectItem key={item.id} value={item.id.toString()}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 relative rounded overflow-hidden bg-gray-100">
                    {item.image_url ? (
                      <Image
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.name_ru}
                        fill
                        className="object-cover"
                        sizes="24px"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <div className="w-2 h-2 bg-gray-400 rounded-full" />
                      </div>
                    )}
                  </div>
                  <span>{item.name_ru}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Дополнительные характеристики */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="has_print"
            checked={formData.has_print}
            onCheckedChange={(checked) => handleInputChange("has_print", checked as boolean)}
          />
          <Label htmlFor="has_print">Есть принт</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="has_details"
            checked={formData.has_details}
            onCheckedChange={(checked) => handleInputChange("has_details", checked as boolean)}
          />
          <Label htmlFor="has_details">Есть детали</Label>
        </div>
      </div>

      {/* Заметки */}
      <div className="space-y-2">
        <Label htmlFor="notes">Заметки</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleInputChange("notes", e.target.value)}
          placeholder="Дополнительная информация о вещи..."
          rows={3}
        />
      </div>

      {/* Кнопки */}
      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editingItem ? "Обновить" : "Добавить"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  )
}
