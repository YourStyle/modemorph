"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, X, Loader2, Check } from "lucide-react"
import Image from "next/image"

interface ResponseItem {
  index: number
  basic_item_id: number | null
  need_gen: boolean
  clothing_item: string
  description: string
  item_name: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  img_url?: string
  image_url?: string
}

interface ItemWithImage extends ResponseItem {
  finalImageUrl?: string
  isAdding?: boolean
  isAdded?: boolean
}

interface ImageUploadFormProps {
  onSuccess?: () => void
}

export function ImageUploadForm({ onSuccess }: ImageUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ItemWithImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      setResults([])
      setError(null)
    }
  }

  const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
      // Скачиваем изображение
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error("Failed to download image")
      }

      const blob = await response.blob()
      const file = new File([blob], "image.jpg", { type: blob.type })

      // Загружаем в blob storage
      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image")
      }

      const { url } = await uploadResponse.json()
      return url
    } catch (error) {
      console.error("Error downloading and uploading image:", error)
      throw error
    }
  }

  const loadBasicItemImages = async (items: ResponseItem[]): Promise<ItemWithImage[]> => {
    const itemsWithImages: ItemWithImage[] = []

    for (const item of items) {
      let finalImageUrl = item.image_url || item.img_url

      try {
        // Если есть img_url, скачиваем и загружаем в blob
        if (item.img_url && !item.image_url) {
          finalImageUrl = await downloadAndUploadImage(item.img_url)
        }
        // Если есть basic_item_id, получаем изображение базовой вещи
        else if (item.basic_item_id && !finalImageUrl) {
          const response = await fetch(`/api/basic-items/${item.basic_item_id}`)
          if (response.ok) {
            const basicItem = await response.json()
            finalImageUrl = basicItem.image_url
          }
        }
      } catch (error) {
        console.error("Error loading image for item:", item.item_name, error)
      }

      itemsWithImages.push({
        ...item,
        finalImageUrl,
      })
    }

    return itemsWithImages
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      // Используем переменную окружения для AI API
      const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://primary-production-84ad.up.railway.app/webhook"
      const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Ошибка анализа изображения")
      }

      const data = await response.json()
      console.log("AI Response:", data)

      if (Array.isArray(data) && data.length > 0) {
        const itemsWithImages = await loadBasicItemImages(data)
        setResults(itemsWithImages)
      } else {
        setError("Не удалось найти вещи на изображении")
      }
    } catch (err) {
      console.error("Error analyzing image:", err)
      setError("Ошибка при анализе изображения")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveItem = async (item: ItemWithImage, index: number) => {
    try {
      // Обновляем состояние - показываем что добавляем
      setResults((prev) => prev.map((r, i) => (i === index ? { ...r, isAdding: true } : r)))

      const itemData = {
        item_name: item.item_name,
        material: item.material,
        color: item.color,
        style: item.style,
        has_print: item.has_print === "yes" ? "есть" : "нет",
        shade: item.shade,
        has_details: item.has_details,
        image_url: item.finalImageUrl,
        basic_item_id: item.basic_item_id,
      }

      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(itemData),
      })

      if (!response.ok) {
        throw new Error("Ошибка сохранения вещи")
      }

      // Обновляем состояние - показываем что добавлено
      setResults((prev) => prev.map((r, i) => (i === index ? { ...r, isAdding: false, isAdded: true } : r)))
    } catch (error) {
      console.error("Error saving item:", error)
      // Сбрасываем состояние при ошибке
      setResults((prev) => prev.map((r, i) => (i === index ? { ...r, isAdding: false } : r)))
    }
  }

  const clearAll = () => {
    setSelectedFile(null)
    setPreview(null)
    setResults([])
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* Upload Section */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Загрузить фото одежды</h3>
                {(selectedFile || results.length > 0) && (
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    <X className="h-3 w-3 mr-1" />
                    Очистить
                  </Button>
                )}
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                >
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-xs text-gray-600 text-center">Нажмите для выбора фото</span>
                </label>
              </div>

              {preview && (
                <div className="mt-3">
                  <img
                    src={preview || "/placeholder.svg"}
                    alt="Preview"
                    className="max-w-full h-32 object-contain mx-auto rounded-lg"
                  />
                </div>
              )}

              {selectedFile && (
                <Button onClick={handleAnalyze} disabled={loading} className="w-full" size="sm">
                  {loading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Анализируем...
                    </>
                  ) : (
                    "Найти вещи на фото"
                  )}
                </Button>
              )}

              {error && <div className="text-red-600 text-xs bg-red-50 p-2 rounded-lg">{error}</div>}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold">Найденные вещи ({results.length})</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {results.map((item, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardContent className="p-3">
                    {/* Изображение */}
                    <div className="aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden relative">
                      {item.finalImageUrl ? (
                        <Image
                          src={item.finalImageUrl || "/placeholder.svg"}
                          alt={item.item_name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl">👕</span>
                        </div>
                      )}
                    </div>

                    {/* Информация */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{item.item_name}</h4>

                      <div className="flex flex-wrap gap-1">
                        {item.basic_item_id && (
                          <Badge variant="default" className="text-xs px-1 py-0">
                            Базовая
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {item.material}
                        </Badge>
                        {item.shade && (
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            {item.shade}
                          </Badge>
                        )}
                      </div>

                      <Button
                        onClick={() => handleSaveItem(item, index)}
                        disabled={item.isAdding || item.isAdded}
                        className="w-full h-8 text-xs"
                        variant={item.isAdded ? "secondary" : "default"}
                        size="sm"
                      >
                        {item.isAdding ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Добавляем...
                          </>
                        ) : item.isAdded ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Добавлено
                          </>
                        ) : (
                          "Добавить"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
