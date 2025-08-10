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

interface BasicItem {
  id: number
  name_ru: string
  name_en: string
  description: string | null
  image_url: string | null
}

interface AddWardrobeItemFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export function AddWardrobeItemForm({ onSuccess, onCancel }: AddWardrobeItemFormProps) {
  const [formData, setFormData] = useState({
    item_name: "",
    size_type: "",
    material: "",
    style: "",
    has_print: false,
    color: "",
    shade: "",
    has_details: false,
    url: "",
    notes: "",
    basic_item_id: "none",
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingBasicItems, setIsLoadingBasicItems] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadBasicItems()
  }, [])

  const loadBasicItems = async () => {
    setIsLoadingBasicItems(true)
    try {
      const response = await fetch("/api/basic-wardrobe-items")
      if (response.ok) {
        const items = await response.json()
        setBasicItems(Array.isArray(items) ? items : [])
      } else {
        setBasicItems([])
      }
    } catch (error) {
      console.error("Error loading basic items:", error)
      setBasicItems([])
    } finally {
      setIsLoadingBasicItems(false)
    }
  }

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.item_name.trim()) {
      toast.error("Название вещи обязательно для заполнения")
      return
    }

    setIsLoading(true)
    try {
      let imageUrl = ""
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await fetch("/api/upload-image", { method: "POST", body: fd })
        if (!uploadRes.ok) throw new Error("Failed to upload image")
        const uploaded = await uploadRes.json()
        imageUrl = uploaded.url
      }

      const submitData = {
        item_name: formData.item_name,
        size_type: formData.size_type || null,
        material: formData.material || null,
        style: formData.style || null,
        has_print: formData.has_print ? "true" : "false",
        color: formData.color || null,
        shade: formData.shade || null,
        has_details: formData.has_details ? "true" : "false",
        url: formData.url || null,
        notes: formData.notes || null,
        basic_item_id:
          formData.basic_item_id && formData.basic_item_id !== "none" ? Number.parseInt(formData.basic_item_id) : null,
        image_url: imageUrl || null,
      }

      const res = await fetch("/api/wardrobe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to add item")
      }

      toast.success("Вещь успешно добавлена в гардероб!")
      // reset
      setFormData({
        item_name: "",
        size_type: "",
        material: "",
        style: "",
        has_print: false,
        color: "",
        shade: "",
        has_details: false,
        url: "",
        notes: "",
        basic_item_id: "none",
      })
      setImageFile(null)
      setImagePreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      onSuccess?.()
    } catch (e) {
      console.error("Error adding item:", e)
      toast.error("Ошибка при добавлении вещи")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Добавить вещь в гардероб</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Фото */}
          <div className="space-y-2">
            <Label>Фото</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              {imagePreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview || "/placeholder.svg"}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={removeImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Выбрать фото
                    </Button>
                  </div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </div>
          </div>

          {/* Название */}
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

          {/* Размер */}
          <div className="space-y-2">
            <Label htmlFor="size_type">Размер</Label>
            <Input
              id="size_type"
              value={formData.size_type}
              onChange={(e) => handleInputChange("size_type", e.target.value)}
              placeholder="Например: M, 42, L"
            />
          </div>

          {/* Цвет */}
          <div className="space-y-2">
            <Label>Цвет</Label>
            <ColorPicker
              value={formData.color}
              onChange={(color) => handleInputChange("color", color)}
              imagePreview={imagePreview}
            />
          </div>

          {/* Оттенок */}
          <div className="space-y-2">
            <Label htmlFor="shade">Оттенок</Label>
            <Input
              id="shade"
              value={formData.shade}
              onChange={(e) => handleInputChange("shade", e.target.value)}
              placeholder="Например: светлый, темный, яркий"
            />
          </div>

          {/* Материал */}
          <div className="space-y-2">
            <Label htmlFor="material">Материал</Label>
            <Input
              id="material"
              value={formData.material}
              onChange={(e) => handleInputChange("material", e.target.value)}
              placeholder="Например: хлопок, шерсть, полиэстер"
            />
          </div>

          {/* Стиль */}
          <div className="space-y-2">
            <Label htmlFor="style">Стиль</Label>
            <Input
              id="style"
              value={formData.style}
              onChange={(e) => handleInputChange("style", e.target.value)}
              placeholder="Например: классический, спортивный, casual"
            />
          </div>

          {/* Характеристики */}
          <div className="space-y-4">
            <Label>Характеристики</Label>
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

          {/* Базовая вещь */}
          <div className="space-y-2">
            <Label>Базовая вещь</Label>
            <Select value={formData.basic_item_id} onValueChange={(value) => handleInputChange("basic_item_id", value)}>
              <SelectTrigger>
                <SelectValue placeholder={isLoadingBasicItems ? "Загрузка..." : "Выберите базовую вещь"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбрано</SelectItem>
                {basicItems.map((item) => (
                  <SelectItem key={item.id} value={item.id.toString()}>
                    {item.name_ru}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ссылка на товар */}
          <div className="space-y-2">
            <Label htmlFor="url">Ссылка на товар в магазине</Label>
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
            <Label htmlFor="notes">Заметки</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="Дополнительная информация о вещи"
              rows={3}
            />
          </div>

          {/* Кнопки */}
          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? "Добавление..." : "Добавить вещь"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Отмена
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
