"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, X, Loader2, Check, Plus } from "lucide-react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Buffer } from "buffer"

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

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

export function ImageUploadForm({ onSuccess }: ImageUploadFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ItemWithImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const newPhotos: UploadedPhoto[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
    }))

    setSelectedFiles((prev) => [...prev, ...newPhotos])
    setResults([])
    setError(null)

    // Очищаем input для возможности повторного выбора тех же файлов
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removePhoto = (id: string) => {
    setSelectedFiles((prev) => {
      const photoToRemove = prev.find((p) => p.id === id)
      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.preview)
      }
      return prev.filter((p) => p.id !== id)
    })
  }

  const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
      if (imageUrl.startsWith("data:image/") || /^[A-Za-z0-9+/]+=*$/.test(imageUrl)) {
        console.log("Processing base64 image...")

        let base64Data: string
        let mimeType = "image/jpeg"

        if (imageUrl.startsWith("data:image/")) {
          const matches = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
          if (matches) {
            mimeType = `image/${matches[1]}`
            base64Data = matches[2]
          } else {
            throw new Error("Invalid base64 image format")
          }
        } else {
          base64Data = imageUrl
        }

        // Convert base64 to blob
        const buffer = Buffer.from(base64Data, "base64")
        const blob = new Blob([buffer], { type: mimeType })
        const file = new File([blob], "image.jpg", { type: mimeType })

        // Upload to S3
        const formData = new FormData()
        formData.append("file", file)

        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        })

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload base64 image")
        }

        const { url } = await uploadResponse.json()
        return url
      }

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

  const getAuthToken = async () => {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token
  }

  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) return

    setLoading(true)
    setError(null)

    try {
      let allResults: ItemWithImage[] = []

      const authToken = await getAuthToken()

      // Анализируем каждое фото с улучшенной обработкой ошибок
      for (const photo of selectedFiles) {
        const formData = new FormData()
        formData.append("image", photo.file)

        // Используем переменную окружения для AI API
        const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"

        // Добавляем таймаут и обработку ошибок
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 минуты

        try {
          const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              ...(authToken && { Authorization: `Bearer ${authToken}` }),
            },
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`AI API Error for ${photo.file.name}:`, errorText)
            continue // Пропускаем этот файл и продолжаем с остальными
          }

          const data = await response.json()
          console.log(`AI Response for ${photo.file.name}:`, data)

          if (Array.isArray(data) && data.length > 0) {
            const itemsWithImages = await loadBasicItemImages(data)
            allResults = [...allResults, ...itemsWithImages]
          }
        } catch (fileError) {
          clearTimeout(timeoutId)
          console.error(`Error processing ${photo.file.name}:`, fileError)
          // Продолжаем с остальными файлами
        }
      }

      if (allResults.length > 0) {
        setResults(allResults)
      } else {
        setError("Не удалось найти вещи на изображениях")
      }
    } catch (err) {
      console.error("Error analyzing images:", err)
      setError("Ошибка при анализе изображений")
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
    // Освобождаем URL объекты
    selectedFiles.forEach((photo) => {
      URL.revokeObjectURL(photo.preview)
    })
    setSelectedFiles([])
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
                {(selectedFiles.length > 0 || results.length > 0) && (
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    <X className="h-3 w-3 mr-1" />
                    Очистить
                  </Button>
                )}
              </div>

              {/* Photo Grid */}
              {selectedFiles.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedFiles.map((photo) => (
                      <div key={photo.id} className="relative group">
                        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={photo.preview || "/placeholder.svg"}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          onClick={() => removePhoto(photo.id)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {/* Add More Button */}
                    <div className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                        multiple
                      />
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer flex flex-col items-center justify-center space-y-1 p-4 text-center"
                      >
                        <Plus className="h-6 w-6 text-gray-400" />
                        <span className="text-xs text-gray-600">Добавить еще</span>
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    multiple
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                  >
                    <Upload className="h-6 w-6 text-gray-400" />
                    <span className="text-xs text-gray-600 text-center">
                      Нажмите для выбора фото
                      <br />
                      <span className="text-gray-500">HEIC, JPEG, JPG, WebP, PNG</span>
                    </span>
                  </label>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <Button onClick={handleAnalyze} disabled={loading} className="w-full" size="sm">
                  {loading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Анализируем...
                    </>
                  ) : (
                    `Найти вещи на ${selectedFiles.length} ${
                      selectedFiles.length === 1 ? "фото" : selectedFiles.length < 5 ? "фото" : "фото"
                    }`
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
