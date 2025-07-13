"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, ImageIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface BasicItem {
  id: number
  name_ru: string
  name_en: string
  description: string | null
  image_url: string | null
}

interface BasicMaterial {
  id: number
  name_ru: string
  name_en: string
  description: string | null
  properties: string | null
}

export function AddWardrobeItemForm() {
  const [formData, setFormData] = useState({
    item_name: "",
    color: "#808080",
    size_type: "",
    material: "",
    style: "",
    has_print: false,
    has_details: false,
    shade: "",
    url: "",
    notes: "",
    is_basic: false,
    basic_item_id: "",
    basic_material_id: "",
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [basicMaterials, setBasicMaterials] = useState<BasicMaterial[]>([])
  const [loadingBasicItems, setLoadingBasicItems] = useState(true)
  const [loadingBasicMaterials, setLoadingBasicMaterials] = useState(true)
  const { toast } = useToast()
  const router = useRouter()

  // Заг��ужаем базовые вещи и материалы при монтировании компонента
  useEffect(() => {
    fetchBasicItems()
    fetchBasicMaterials()
  }, [])

  const fetchBasicItems = async () => {
    setLoadingBasicItems(true)
    try {
      const response = await fetch("/api/basic-items")
      if (!response.ok) {
        throw new Error("Failed to fetch basic items")
      }
      const data = await response.json()
      setBasicItems(data.items || [])
    } catch (error) {
      console.error("Error fetching basic items:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить базовые вещи",
        variant: "destructive",
      })
    } finally {
      setLoadingBasicItems(false)
    }
  }

  const fetchBasicMaterials = async () => {
    setLoadingBasicMaterials(true)
    try {
      const response = await fetch("/api/basic-materials")
      if (!response.ok) {
        throw new Error("Failed to fetch basic materials")
      }
      const data = await response.json()
      setBasicMaterials(data.materials || [])
    } catch (error) {
      console.error("Error fetching basic materials:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить базовые материалы",
        variant: "destructive",
      })
    } finally {
      setLoadingBasicMaterials(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setImageFile(null)
      setImagePreview(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const formDataToSend = new FormData()

      // Добавляем все поля формы, исключая значения "none"
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== "" && value !== "none") {
          formDataToSend.append(key, value.toString())
        }
      })

      // Добавляем изображение, если оно выбрано
      if (imageFile) {
        formDataToSend.append("image", imageFile)
      }

      const response = await fetch("/api/wardrobe/add", {
        method: "POST",
        body: formDataToSend,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add wardrobe item")
      }

      toast({
        title: "Успешно",
        description: "Вещь успешно добавлена в гардероб",
      })

      // Перенаправляем на страницу гардероба
      router.push("/wardrobe")
    } catch (error) {
      console.error("Error adding wardrobe item:", error)
      toast({
        title: "��шибка",
        description: error instanceof Error ? error.message : "Не удалось добавить вещь в гардероб",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Основная информация */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Основная информация</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item_name">Название вещи *</Label>
                <Input
                  id="item_name"
                  name="item_name"
                  value={formData.item_name}
                  onChange={handleInputChange}
                  placeholder="Например: Джинсы синие прямые"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Цвет *</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    name="color"
                    type="color"
                    value={formData.color.startsWith("#") ? formData.color : "#808080"}
                    onChange={handleInputChange}
                    className="w-16 h-10 p-1 border rounded"
                  />
                  <Input
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    placeholder="Или введите HEX код (#FF0000)"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-gray-500">Выберите цвет или введите HEX код (например: #FF0000)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="basic_item_id">Базовая вещь *</Label>
                <Select
                  name="basic_item_id"
                  value={formData.basic_item_id}
                  onValueChange={(value) => handleSelectChange("basic_item_id", value)}
                  required
                >
                  <SelectTrigger id="basic_item_id">
                    <SelectValue placeholder="Выберите базовую вещь" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingBasicItems ? (
                      <SelectItem value="loading" disabled>
                        Загрузка...
                      </SelectItem>
                    ) : basicItems.length === 0 ? (
                      <SelectItem value="no-items" disabled>
                        Нет базовых вещей
                      </SelectItem>
                    ) : (
                      basicItems.map((item) => (
                        <SelectItem key={item.id} value={item.id.toString()}>
                          {item.name_ru}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500 flex justify-between">
                  <span>Выберите базовую вещь (определяет тип)</span>
                  <Link href="/wardrobe/basics" className="text-blue-600 hover:underline">
                    создайте новую
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="size_type">Размер</Label>
                <Select
                  name="size_type"
                  value={formData.size_type}
                  onValueChange={(value) => handleSelectChange("size_type", value)}
                >
                  <SelectTrigger id="size_type">
                    <SelectValue placeholder="Выберите размер" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Short">Короткий</SelectItem>
                    <SelectItem value="Regular">Обычный</SelectItem>
                    <SelectItem value="Long">Длинный</SelectItem>
                    <SelectItem value="Oversize">Оверсайз</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="basic_material_id">Материал</Label>
                <Select
                  name="basic_material_id"
                  value={formData.basic_material_id}
                  onValueChange={(value) => handleSelectChange("basic_material_id", value)}
                >
                  <SelectTrigger id="basic_material_id">
                    <SelectValue placeholder="Выберите материал" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не выбрано</SelectItem>
                    {loadingBasicMaterials ? (
                      <SelectItem value="loading" disabled>
                        Загрузка...
                      </SelectItem>
                    ) : basicMaterials.length === 0 ? (
                      <SelectItem value="no-materials" disabled>
                        Нет базовых материалов
                      </SelectItem>
                    ) : (
                      basicMaterials.map((material) => (
                        <SelectItem key={material.id} value={material.id.toString()}>
                          {material.name_ru}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500 flex justify-between">
                  <span>Выберите материал или</span>
                  <Link href="/wardrobe/basics?tab=materials" className="text-blue-600 hover:underline">
                    создайте новый
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="material">Материал (текст)</Label>
                <Input
                  id="material"
                  name="material"
                  value={formData.material}
                  onChange={handleInputChange}
                  placeholder="Например: Хлопок, Шерсть, Шелк"
                />
                <p className="text-xs text-gray-500">
                  Можно указать материал текстом, если его нет в списке базовых материалов
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="style">Стиль</Label>
                <Select
                  name="style"
                  value={formData.style}
                  onValueChange={(value) => handleSelectChange("style", value)}
                >
                  <SelectTrigger id="style">
                    <SelectValue placeholder="Выберите стиль" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Casual">Повседневный</SelectItem>
                    <SelectItem value="Classic">Классический</SelectItem>
                    <SelectItem value="Classic/casual">Классический/повседневный</SelectItem>
                    <SelectItem value="Classic/evening">Классический/вечерний</SelectItem>
                    <SelectItem value="Evening">Вечерний</SelectItem>
                    <SelectItem value="Sport">Спортивный</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shade">Оттенок</Label>
                <Select
                  name="shade"
                  value={formData.shade}
                  onValueChange={(value) => handleSelectChange("shade", value)}
                >
                  <SelectTrigger id="shade">
                    <SelectValue placeholder="Выберите оттенок" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Light">Светлый</SelectItem>
                    <SelectItem value="Dark">Темный</SelectItem>
                    <SelectItem value="Colourful">Яркий</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">Ссылка на товар</Label>
              <Input
                id="url"
                name="url"
                value={formData.url}
                onChange={handleInputChange}
                placeholder="https://example.com/product"
                type="url"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2 pt-4">
                <Checkbox
                  id="has_print"
                  checked={formData.has_print}
                  onCheckedChange={(checked) => handleCheckboxChange("has_print", checked === true)}
                />
                <Label htmlFor="has_print" className="cursor-pointer">
                  С принтом
                </Label>
              </div>

              <div className="flex items-center space-x-2 pt-4">
                <Checkbox
                  id="has_details"
                  checked={formData.has_details}
                  onCheckedChange={(checked) => handleCheckboxChange("has_details", checked === true)}
                />
                <Label htmlFor="has_details" className="cursor-pointer">
                  С деталями
                </Label>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-4">
              <Checkbox
                id="is_basic"
                checked={formData.is_basic}
                onCheckedChange={(checked) => handleCheckboxChange("is_basic", checked === true)}
              />
              <Label htmlFor="is_basic" className="cursor-pointer">
                Это базовая вещь
              </Label>
            </div>
          </div>

          {/* Изображение */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Изображение</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="image">Загрузить изображение</Label>
                <Input id="image" type="file" accept="image/*" onChange={handleImageChange} className="mt-2" />
              </div>

              <div>
                {imagePreview ? (
                  <div className="relative aspect-square bg-gray-100 rounded-md overflow-hidden">
                    <img
                      src={imagePreview || "/placeholder.svg"}
                      alt="Preview"
                      className="object-cover w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center aspect-square bg-gray-100 rounded-md">
                    <ImageIcon className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Примечания */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Примечания</h2>

            <div>
              <Label htmlFor="notes">Дополнительная информация</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Дополнительная информация о вещи"
                rows={4}
                className="mt-2"
              />
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={() => router.push("/wardrobe")}>
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Добавить вещь
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default AddWardrobeItemForm
