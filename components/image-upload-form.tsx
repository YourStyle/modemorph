"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Loader2, Plus, Check } from "lucide-react"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"

interface MatchedItem {
  id: string
  name: string
  material?: string
  image_url?: string
  basic_item_id?: string
}

interface ItemWithImage extends MatchedItem {
  imageUrl?: string
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [matchedItems, setMatchedItems] = useState<ItemWithImage[]>([])
  const [addingItems, setAddingItems] = useState<Set<string>>(new Set())
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set())

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      setMatchedItems([])
      setAddedItems(new Set())
    }
  }

  const loadBasicItemImages = async (items: MatchedItem[]): Promise<ItemWithImage[]> => {
    const itemsWithImages = await Promise.all(
      items.map(async (item) => {
        if (item.basic_item_id && !item.image_url) {
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

  const handleUpload = async () => {
    if (!selectedFile) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const response = await fetch("/api/images/match", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Ошибка при обработке изображения")
      }

      const data = await response.json()

      if (data.matches && data.matches.length > 0) {
        const itemsWithImages = await loadBasicItemImages(data.matches)
        setMatchedItems(itemsWithImages)
      } else {
        setMatchedItems([])
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert("Ошибка при загрузке изображения")
    } finally {
      setLoading(false)
    }
  }

  const handleAddToWardrobe = async (item: ItemWithImage) => {
    setAddingItems((prev) => new Set(prev).add(item.id))

    try {
      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          basic_item_id: item.basic_item_id,
          name: item.name,
          material: item.material,
          image_url: item.imageUrl || item.image_url,
        }),
      })

      if (!response.ok) {
        throw new Error("Ошибка при добавлении в гардероб")
      }

      setAddedItems((prev) => new Set(prev).add(item.id))
    } catch (error) {
      console.error("Error adding to wardrobe:", error)
      alert("Ошибка при добавлении в гардероб")
    } finally {
      setAddingItems((prev) => {
        const newSet = new Set(prev)
        newSet.delete(item.id)
        return newSet
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Upload Section */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">Загрузите фото одежды</p>
                <p className="text-sm text-gray-500">PNG, JPG до 10MB</p>
              </label>
            </div>

            {preview && (
              <div className="flex justify-center">
                <img
                  src={preview || "/placeholder.svg"}
                  alt="Preview"
                  className="max-w-xs max-h-64 object-contain rounded-lg border"
                />
              </div>
            )}

            {selectedFile && (
              <div className="flex justify-center">
                <Button onClick={handleUpload} disabled={loading} className="px-8">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Обработка...
                    </>
                  ) : (
                    "Найти похожие вещи"
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {matchedItems.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Найденные вещи ({matchedItems.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matchedItems.map((item) => (
              <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="aspect-square relative bg-gray-50">
                  <CachedWardrobeImage
                    src={item.imageUrl || item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    basicItemId={item.basic_item_id}
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg mb-2 line-clamp-2">{item.name}</h3>

                  {item.material && (
                    <Badge variant="secondary" className="mb-3">
                      {item.material}
                    </Badge>
                  )}

                  <Button
                    onClick={() => handleAddToWardrobe(item)}
                    disabled={addingItems.has(item.id) || addedItems.has(item.id)}
                    className="w-full"
                    variant={addedItems.has(item.id) ? "outline" : "default"}
                  >
                    {addingItems.has(item.id) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Добавление...
                      </>
                    ) : addedItems.has(item.id) ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Добавлено
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Добавить в гардероб
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {matchedItems.length === 0 && selectedFile && !loading && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">Похожие вещи не найдены. Попробуйте другое изображение.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
