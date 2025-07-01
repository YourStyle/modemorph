"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, X, Loader2, Check } from "lucide-react"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"

interface ResponseItem {
  name: string
  clothing_type: string
  color: string
  material: string
  style?: string
  print?: string
  img_url?: string
  image_url?: string
  basic_item_id?: string
}

interface ItemWithImage extends ResponseItem {
  finalImageUrl?: string
  isAdding?: boolean
  isAdded?: boolean
}

export function ImageUploadForm() {
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
      let finalImageUrl = item.image_url

      try {
        // Если есть img_url, скачиваем и загружаем в blob
        if (item.img_url) {
          finalImageUrl = await downloadAndUploadImage(item.img_url)
        }
        // Если есть basic_item_id, получаем изображение базовой вещи
        else if (item.basic_item_id) {
          const response = await fetch(`/api/basic-items/${item.basic_item_id}`)
          if (response.ok) {
            const basicItem = await response.json()
            finalImageUrl = basicItem.image_url
          }
        }
      } catch (error) {
        console.error("Error loading image for item:", item.name, error)
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

      if (data.items && Array.isArray(data.items)) {
        const itemsWithImages = await loadBasicItemImages(data.items)
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
        name: item.name,
        clothing_type: item.clothing_type,
        color: item.color,
        material: item.material,
        style: item.style || "",
        print: item.print || "",
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
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Загрузить фото одежды</h3>
              {(selectedFile || results.length > 0) && (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  <X className="h-4 w-4 mr-2" />
                  Очистить
                </Button>
              )}
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
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
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm text-gray-600">Нажмите для выбора фото или перетащите сюда</span>
              </label>
            </div>

            {preview && (
              <div className="mt-4">
                <img
                  src={preview || "/placeholder.svg"}
                  alt="Preview"
                  className="max-w-full h-64 object-contain mx-auto rounded-lg"
                />
              </div>
            )}

            {selectedFile && (
              <Button onClick={handleAnalyze} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Анализируем изображение...
                  </>
                ) : (
                  "Найти вещи на фото"
                )}
              </Button>
            )}

            {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Найденные вещи</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((item, index) => (
              <Card key={index} className="overflow-hidden">
                <div className="aspect-square relative bg-gray-50">
                  <CachedWardrobeImage
                    src={item.finalImageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    basicItemId={item.basic_item_id}
                  />
                </div>
                <CardContent className="p-4">
                  <h4 className="font-semibold text-lg mb-2">{item.name}</h4>

                  <div className="space-y-2 mb-4">
                    <Badge variant="secondary" className="text-xs">
                      {item.material}
                    </Badge>
                    {item.color && (
                      <Badge variant="outline" className="text-xs ml-1">
                        {item.color}
                      </Badge>
                    )}
                    {item.style && (
                      <Badge variant="outline" className="text-xs ml-1">
                        {item.style}
                      </Badge>
                    )}
                    {item.print && item.print !== "нет" && (
                      <Badge variant="outline" className="text-xs ml-1">
                        {item.print}
                      </Badge>
                    )}
                  </div>

                  <Button
                    onClick={() => handleSaveItem(item, index)}
                    disabled={item.isAdding || item.isAdded}
                    className="w-full"
                    variant={item.isAdded ? "secondary" : "default"}
                  >
                    {item.isAdding ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Добавляем...
                      </>
                    ) : item.isAdded ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Добавлено
                      </>
                    ) : (
                      "Добавить в гардероб"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
