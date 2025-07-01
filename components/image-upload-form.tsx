"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Plus, Check } from "lucide-react"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"

interface DetectedItem {
  id: string
  name: string
  material: string
  color?: string
  style?: string
  print?: string
  image_url?: string
  basic_item_id?: string
}

interface ItemWithImage extends DetectedItem {
  imageUrl?: string
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detectedItems, setDetectedItems] = useState<ItemWithImage[]>([])
  const [addingItems, setAddingItems] = useState<Set<string>>(new Set())
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set())

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setDetectedItems([])
      setAddedItems(new Set())
    }
  }

  const loadBasicItemImages = async (items: DetectedItem[]): Promise<ItemWithImage[]> => {
    const itemsWithImages = await Promise.all(
      items.map(async (item) => {
        if (item.basic_item_id) {
          try {
            const response = await fetch(`/api/basic-items/${item.basic_item_id}`)
            if (response.ok) {
              const basicItem = await response.json()
              return {
                ...item,
                imageUrl: basicItem.image_url,
              }
            }
          } catch (error) {
            console.error("Error loading basic item image:", error)
          }
        }
        return {
          ...item,
          imageUrl: item.image_url,
        }
      }),
    )
    return itemsWithImages
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const response = await fetch("https://primary-production-84ad.up.railway.app/webhook-test/ai-photo-parse", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to analyze image")
      }

      const result = await response.json()
      console.log("AI Analysis result:", result)

      if (result.items && Array.isArray(result.items)) {
        const itemsWithImages = await loadBasicItemImages(result.items)
        setDetectedItems(itemsWithImages)
      } else {
        setDetectedItems([])
      }
    } catch (error) {
      console.error("Error analyzing image:", error)
      alert("Ошибка при анализе изображения")
    } finally {
      setLoading(false)
    }
  }

  const handleAddToWardrobe = async (item: ItemWithImage) => {
    setAddingItems((prev) => new Set(prev).add(item.id))

    try {
      // Сохраняем изображение в blob storage если есть base64
      let imageUrl = item.imageUrl

      if (selectedFile && !item.basic_item_id) {
        const formData = new FormData()
        formData.append("file", selectedFile)

        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        })

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json()
          imageUrl = uploadResult.url
        }
      }

      // Добавляем вещь в гардероб пользователя
      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: item.name,
          clothing_type: "clothing", // можно добавить определение типа
          color: item.color || "",
          material: item.material,
          style: item.style || "",
          print: item.print || "",
          image_url: imageUrl,
          basic_item_id: item.basic_item_id,
          is_hidden: false,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to add item to wardrobe")
      }

      setAddedItems((prev) => new Set(prev).add(item.id))
    } catch (error) {
      console.error("Error adding item to wardrobe:", error)
      alert("Ошибка при добавлении вещи в гардероб")
    } finally {
      setAddingItems((prev) => {
        const newSet = new Set(prev)
        newSet.delete(item.id)
        return newSet
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Загрузить фото одежды</h1>
        <p className="text-gray-600">Загрузите фото ваших вещей, и мы поможем определить их и добавить в гардероб</p>
      </div>

      <div className="space-y-6">
        {/* Загрузка файла */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6">
              <Upload className="w-12 h-12 text-gray-400 mb-4" />
              <div className="text-center">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-lg font-medium text-gray-900">Выберите фото</span>
                  <input id="file-upload" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                </label>
                <p className="text-gray-500 mt-1">PNG, JPG до 10MB</p>
              </div>
            </div>

            {previewUrl && (
              <div className="mt-4 text-center">
                <img
                  src={previewUrl || "/placeholder.svg"}
                  alt="Preview"
                  className="max-w-xs max-h-64 mx-auto rounded-lg shadow-md"
                />
                <Button onClick={handleAnalyze} disabled={loading} className="mt-4">
                  {loading ? "Анализируем..." : "Найти вещи на фото"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Результаты анализа */}
        {detectedItems.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4">Найденные вещи ({detectedItems.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {detectedItems.map((item) => (
                  <Card key={item.id} className="overflow-hidden">
                    <div className="aspect-square relative bg-gray-100">
                      <CachedWardrobeImage
                        src={item.imageUrl || ""}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        basicItemId={item.basic_item_id}
                      />
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{item.name}</h3>

                      <div className="space-y-2 mb-3">
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
                        {item.print && (
                          <Badge variant="outline" className="text-xs ml-1">
                            {item.print}
                          </Badge>
                        )}
                      </div>

                      <Button
                        onClick={() => handleAddToWardrobe(item)}
                        disabled={addingItems.has(item.id) || addedItems.has(item.id)}
                        className="w-full"
                        size="sm"
                      >
                        {addingItems.has(item.id) ? (
                          "Добавляем..."
                        ) : addedItems.has(item.id) ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Добавлено
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Добавить в гардероб
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
