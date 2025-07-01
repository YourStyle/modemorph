"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Loader2, Check, X } from "lucide-react"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"

interface ResponseItem {
  index: number
  basic_item_id?: string | null
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
  saving?: boolean
  saved?: boolean
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ItemWithImage[]>([])
  const [error, setError] = useState<string | null>(null)

  const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
      // Скачиваем изображение
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error("Failed to download image")
      }

      const blob = await response.blob()
      const file = new File([blob], "image.webp", { type: blob.type })

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
      let finalImageUrl = ""

      try {
        if (item.img_url) {
          // Новые изображения - скачиваем и загружаем в blob
          finalImageUrl = await downloadAndUploadImage(item.img_url)
        } else if (item.image_url) {
          // Старые изображения - используем напрямую
          finalImageUrl = item.image_url
        } else if (item.basic_item_id) {
          // Базовые вещи - получаем через API
          const response = await fetch(`/api/basic-items/${item.basic_item_id}`)
          if (response.ok) {
            const basicItem = await response.json()
            finalImageUrl = basicItem.image_url || ""
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setItems([])
      setError(null)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://primary-production-84ad.up.railway.app/webhook"
      const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Ошибка анализа изображения")
      }

      const data: ResponseItem[] = await response.json()
      console.log("AI Analysis result:", data)

      // Загружаем изображения для всех найденных вещей
      const itemsWithImages = await loadBasicItemImages(data)
      setItems(itemsWithImages)
    } catch (err) {
      console.error("Error analyzing image:", err)
      setError("Не удалось проанализировать изображение")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveItem = async (item: ItemWithImage) => {
    setItems((prev) => prev.map((i) => (i.index === item.index ? { ...i, saving: true } : i)))

    try {
      const itemData = {
        item_name: item.item_name,
        material: item.material,
        color: item.color,
        shade: item.shade,
        style: item.style,
        has_print: item.has_print,
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

      setItems((prev) => prev.map((i) => (i.index === item.index ? { ...i, saving: false, saved: true } : i)))
    } catch (error) {
      console.error("Error saving item:", error)
      setItems((prev) => prev.map((i) => (i.index === item.index ? { ...i, saving: false } : i)))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                Загрузите фото одежды
              </label>
              <div className="flex items-center space-x-4">
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={!selectedFile || loading}
                  className="flex items-center space-x-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>{loading ? "Анализ..." : "Анализировать"}</span>
                </Button>
              </div>
            </div>

            {selectedFile && (
              <div className="mt-4">
                <p className="text-sm text-gray-600">Выбран файл: {selectedFile.name}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-600">
              <X className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Найденные вещи:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <Card key={item.index} className="overflow-hidden">
                <div className="aspect-square relative bg-gray-50">
                  <CachedWardrobeImage
                    src={item.finalImageUrl}
                    alt={item.item_name}
                    className="w-full h-full object-cover"
                    basicItemId={item.basic_item_id}
                  />
                </div>
                <CardContent className="p-4">
                  <h4 className="font-semibold text-lg mb-2">{item.item_name}</h4>

                  <div className="space-y-2 mb-4">
                    <Badge variant="secondary" className="text-xs">
                      {item.material}
                    </Badge>
                    {item.shade && (
                      <Badge variant="outline" className="text-xs ml-1">
                        {item.shade}
                      </Badge>
                    )}
                    {item.style && (
                      <Badge variant="outline" className="text-xs ml-1">
                        {item.style}
                      </Badge>
                    )}
                  </div>

                  <Button
                    onClick={() => handleSaveItem(item)}
                    disabled={item.saving || item.saved}
                    className="w-full"
                    variant={item.saved ? "secondary" : "default"}
                  >
                    {item.saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Добавление...
                      </>
                    ) : item.saved ? (
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
