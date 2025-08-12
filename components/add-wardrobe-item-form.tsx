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
import { Upload, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { ColorPicker } from "./color-picker"

const CLOTHING_TYPES = [
  "верхняя", // футболка, рубашка, свитер, худи, кардиган, пиджак и т.п.
  "нижняя", // брюки, джинсы, шорты, юбка
  "платье",
  "комбинезон",
  "верхняя одежда", // пальто, куртка, пуховик, плащ
  "обувь",
  "аксессуар", // сумка, ремень, шапка, шарф, украшения
  "часы",
  "головной убор",
  "спорт",
] as const

const AI_PART_MAPPING: Record<string, string> = {
  upper: "верхняя",
  lower: "нижняя",
  accessories: "аксессуар",
  dress: "платье",
}

interface BasicItem {
  id: number
  item_name?: string
  name_ru?: string
  name_en?: string
  description: string | null
  image_url: string | null
}

interface AddWardrobeItemFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

interface AIAnalysisResponse {
  clothing_item: string
  part: string
  description: string
  description_en: string
  item_name: string
  item_name_en: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  basic_item_id: number | null
  img_url?: string // Made img_url optional since it might not be present in text-only analysis
}

export function AddWardrobeItemForm({ onSuccess, onCancel }: AddWardrobeItemFormProps) {
  const [formData, setFormData] = useState({
    item_name: "",
    item_name_en: "",
    description: "",
    description_en: "",
    size_type: "",
    material: "",
    style: "",
    has_print: false,
    color: "",
    shade: "",
    has_details: false,
    store_url: "",
    notes: "",
    basic_item_id: "none",
    clothing_type: "",
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [aiAnalysisItems, setAiAnalysisItems] = useState<AIAnalysisResponse[]>([])
  const [selectedAiItem, setSelectedAiItem] = useState<AIAnalysisResponse | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
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
      const data = await response.json().catch(() => null)
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setBasicItems(arr)
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

  const handleAIAnalysis = async (type: "text" | "all" = "text") => {
    if (!imageFile) {
      toast.error("Сначала загрузите фото")
      return
    }

    setIsAnalyzing(true)
    try {
      // Upload image first
      const fd = new FormData()
      fd.append("file", imageFile)
      const uploadRes = await fetch("/api/upload-image", { method: "POST", body: fd })
      if (!uploadRes.ok) throw new Error("Failed to upload image")
      const uploaded = await uploadRes.json()

      // Call AI analysis
      const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL
      if (!aiApiUrl) {
        throw new Error("AI API URL not configured")
      }

      const analysisRes = await fetch(`${aiApiUrl}/get-clothes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: uploaded.url,
          type: type,
        }),
      })

      if (!analysisRes.ok) throw new Error("AI analysis failed")
      const analysis: AIAnalysisResponse[] = await analysisRes.json()

      // Set AI analysis items
      setAiAnalysisItems(analysis)
      setSelectedAiItem(null)

      toast.success("ИИ анализ завершен! Выберите вещь из списка")
    } catch (error) {
      console.error("AI analysis error:", error)
      toast.error("Ошибка при анализе изображения")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const selectAiItem = (item: AIAnalysisResponse) => {
    setSelectedAiItem(item)

    // Map AI response to form fields
    setFormData((prev) => ({
      ...prev,
      item_name: item.item_name || prev.item_name,
      item_name_en: item.item_name_en || prev.item_name_en,
      description: item.description || prev.description,
      description_en: item.description_en || prev.description_en,
      material: item.material || prev.material,
      style: item.style || prev.style,
      color: item.color || prev.color,
      shade: item.shade || prev.shade,
      has_print: item.has_print === "true",
      has_details: item.has_details !== "false" && item.has_details !== "",
      clothing_type: AI_PART_MAPPING[item.part] || prev.clothing_type,
    }))

    if (item.img_url) {
      // Set the AI processed image as preview
      setImagePreview(item.img_url)
      // Clear the original file since we're using AI processed image
      setImageFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      toast.success("Поля заполнены данными выбранной вещи и фото заменено")
    } else {
      // Keep original photo, only fill form fields
      toast.success("Поля заполнены данными выбранной вещи")
    }
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

      if (selectedAiItem && !imageFile) {
        imageUrl = selectedAiItem.img_url
      } else if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await fetch("/api/upload-image", { method: "POST", body: fd })
        if (!uploadRes.ok) throw new Error("Failed to upload image")
        const uploaded = await uploadRes.json()
        imageUrl = uploaded.url
      } else if (imagePreview && imagePreview.startsWith("http")) {
        // Use the preview URL if it's already a URL (from AI analysis)
        imageUrl = imagePreview
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

      toast.success("Вещь успешно сохранена")
      onSuccess?.()
    } catch (error) {
      console.error("Error saving item:", error)
      toast.error("Ошибка при сохранении вещи")
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
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Фото вещи</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                  {imagePreview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview || "/placeholder.svg"}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      {imageFile && (
                        <div className="absolute bottom-2 left-2 flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAIAnalysis("text")}
                            disabled={isAnalyzing}
                          >
                            <Sparkles className="h-4 w-4 mr-1" />
                            {isAnalyzing ? "Анализ..." : "ИИ анализ"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAIAnalysis("all")}
                            disabled={isAnalyzing}
                          >
                            <Sparkles className="h-4 w-4 mr-1" />
                            {isAnalyzing ? "Генерация..." : "ИИ генерация"}
                          </Button>
                        </div>
                      )}
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>

                {aiAnalysisItems.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-medium">Выберите вещь из анализа:</h4>
                    <div className="grid gap-3 max-h-60 overflow-y-auto">
                      {aiAnalysisItems.map((item, index) => (
                        <div
                          key={index}
                          onClick={() => selectAiItem(item)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedAiItem === item
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex gap-3">
                            {item.img_url && (
                              <div className="w-16 h-16 flex-shrink-0">
                                <img
                                  src={item.img_url || "/placeholder.svg"}
                                  alt={item.item_name}
                                  className="w-full h-full object-cover rounded"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-sm truncate">{item.item_name}</h5>
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                              <div className="flex gap-2 mt-2 text-xs text-gray-500">
                                <span className="bg-gray-100 px-2 py-1 rounded">
                                  {AI_PART_MAPPING[item.part] || item.part}
                                </span>
                                <span className="bg-gray-100 px-2 py-1 rounded">{item.material}</span>
                                {item.img_url && (
                                  <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded">С фото</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                  <SelectValue placeholder={isLoadingBasicItems ? "Загрузка..." : "Выберите базовую вещь"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не выбрано</SelectItem>
                  {basicItems.map((item) => {
                    const name = item.item_name || item.name_ru || item.name_en || "Без названия"
                    return (
                      <SelectItem key={item.id} value={String(item.id)}>
                        <div className="flex items-center gap-2">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
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
              <Label htmlFor="store_url">Ссылка на товар в магазине</Label>
              <Input
                id="store_url"
                type="url"
                value={formData.store_url}
                onChange={(e) => setFormData({ ...formData, store_url: e.target.value })}
                placeholder="https://shop.com/product/123"
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
                {isLoading ? "Добавление..." : "Добавить вещь"}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Отмена
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default AddWardrobeItemForm
