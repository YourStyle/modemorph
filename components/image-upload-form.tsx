"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Loader2, Check, X } from "lucide-react"
import { CachedWardrobeImage } from "./cached-wardrobe-image"

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
  displayImageUrl: string
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ItemWithImage[]>([])
  const [savingStates, setSavingStates] = useState<{ [key: number]: "saving" | "saved" | "error" }>({})

  // Get AI API URL from environment variable with fallback
  const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://primary-production-84ad.up.railway.app/webhook"

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setResults([])
    }
  }

  const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
      // Download the image
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`)
      }

      const blob = await response.blob()
      const file = new File([blob], "image.webp", { type: blob.type })

      // Upload to our blob storage
      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload image: ${uploadResponse.statusText}`)
      }

      const { url } = await uploadResponse.json()
      return url
    } catch (error) {
      console.error("Error downloading and uploading image:", error)
      throw error
    }
  }

  const loadBasicItemImages = async (basicItemIds: number[]): Promise<{ [key: number]: string }> => {
    try {
      const response = await fetch("/api/basic-items")
      if (!response.ok) {
        console.error("Failed to fetch basic items:", response.status)
        return {}
      }

      const basicItems = await response.json()
      const imageMap: { [key: number]: string } = {}

      for (const id of basicItemIds) {
        const item = basicItems.find((item: any) => item.id === id)
        if (item?.image_url) {
          imageMap[id] = item.image_url
        }
      }

      return imageMap
    } catch (error) {
      console.error("Error loading basic item images:", error)
      return {}
    }
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ResponseItem[] = await response.json()
      console.log("AI Analysis result:", data)

      // Load images for basic items
      const basicItemIds = data.filter((item) => item.basic_item_id).map((item) => item.basic_item_id!)
      const basicItemImages = await loadBasicItemImages(basicItemIds)

      // Process items and prepare display images
      const itemsWithImages: ItemWithImage[] = await Promise.all(
        data.map(async (item) => {
          let displayImageUrl = ""

          if (item.basic_item_id && basicItemImages[item.basic_item_id]) {
            displayImageUrl = basicItemImages[item.basic_item_id]
          } else if (item.img_url) {
            displayImageUrl = item.img_url
          } else if (item.image_url) {
            displayImageUrl = item.image_url
          }

          return {
            ...item,
            displayImageUrl,
          }
        }),
      )

      setResults(itemsWithImages)
    } catch (error) {
      console.error("Error analyzing image:", error)
      alert("Ошибка при анализе изображения. Попробуйте еще раз.")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveItem = async (item: ItemWithImage) => {
    setSavingStates((prev) => ({ ...prev, [item.index]: "saving" }))

    try {
      let finalImageUrl = item.displayImageUrl

      // If we have img_url, download and upload to our blob storage
      if (item.img_url) {
        finalImageUrl = await downloadAndUploadImage(item.img_url)
      }

      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_name: item.item_name,
          material: item.material,
          color: item.color,
          shade: item.shade,
          style: item.style,
          has_print: item.has_print,
          has_details: item.has_details,
          image_url: finalImageUrl,
          basic_item_id: item.basic_item_id,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      setSavingStates((prev) => ({ ...prev, [item.index]: "saved" }))
    } catch (error) {
      console.error("Error saving item:", error)
      setSavingStates((prev) => ({ ...prev, [item.index]: "error" }))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 mb-2">
                Загрузите фото вашего образа
              </label>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="image-upload"
                  className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl || "/placeholder.svg"}
                      alt="Preview"
                      className="max-h-60 max-w-full object-contain rounded"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-4 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Нажмите для загрузки</span> или перетащите файл
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG или WEBP (макс. 10MB)</p>
                    </div>
                  )}
                  <input
                    id="image-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                </label>
              </div>
            </div>

            <Button onClick={handleAnalyze} disabled={!selectedFile || loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Анализируем изображение...
                </>
              ) : (
                "Найти вещи на фото"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Найденные вещи</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((item) => (
              <Card key={item.index} className="overflow-hidden">
                <div className="aspect-square relative">
                  <CachedWardrobeImage
                    src={item.displayImageUrl}
                    alt={item.item_name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg mb-2 capitalize">{item.item_name}</h3>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="secondary">{item.material}</Badge>
                    <Badge variant="outline">{item.shade}</Badge>
                  </div>

                  <Button
                    onClick={() => handleSaveItem(item)}
                    disabled={savingStates[item.index] === "saving" || savingStates[item.index] === "saved"}
                    className="w-full"
                    variant={savingStates[item.index] === "saved" ? "default" : "outline"}
                  >
                    {savingStates[item.index] === "saving" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Добавление...
                      </>
                    ) : savingStates[item.index] === "saved" ? (
                      <>
                        <Check className="w-4 w-4 mr-2" />
                        Добавлено
                      </>
                    ) : savingStates[item.index] === "error" ? (
                      <>
                        <X className="w-4 w-4 mr-2" />
                        Ошибка
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
