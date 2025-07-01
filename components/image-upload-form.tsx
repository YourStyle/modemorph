"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, ImageIcon, X, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ResponseItem {
  index?: number
  basic_item_id?: number | null
  need_gen?: boolean
  clothing_item: string
  description: string
  item_name: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  img_url?: string // новые изображения
  image_url?: string // старые изображения
}

interface ItemWithImage extends ResponseItem {
  imageUrl?: string
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [responseItems, setResponseItems] = useState<ItemWithImage[]>([])
  const [savedItems, setSavedItems] = useState<number[]>([])
  const { toast } = useToast()

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive",
      })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 10MB",
        variant: "destructive",
      })
      return
    }

    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setResponseItems([])
    setSavedItems([])
  }

  // Функция для скачивания изображения по URL и загрузки в blob
  const downloadAndUploadImage = async (imageUrl: string): Promise<string | null> => {
    try {
      // Скачиваем изображение
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error("Failed to download image")
      }

      const blob = await response.blob()
      const file = new File([blob], `wardrobe-item-${Date.now()}.jpg`, { type: blob.type })

      // Загружаем в наш blob storage
      const formData = new FormData()
      formData.append("file", file)
      formData.append("prefix", "users-wardrobe")

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (uploadResponse.ok) {
        const data = await uploadResponse.json()
        return data.url
      }
      return null
    } catch (error) {
      console.error("Error downloading and uploading image:", error)
      return null
    }
  }

  const loadItemImages = async (items: ResponseItem[]) => {
    const itemsWithImages: ItemWithImage[] = []

    for (const item of items) {
      let imageUrl = ""

      // Для новых изображений используем img_url
      if (item.img_url) {
        imageUrl = item.img_url
      }
      // Для старых изображений используем image_url
      else if (item.image_url) {
        imageUrl = item.image_url
      }
      // Если есть basic_item_id, получаем изображение базовой вещи
      else if (item.basic_item_id) {
        try {
          const response = await fetch(`/api/basic-items/${item.basic_item_id}`)
          if (response.ok) {
            const basicItem = await response.json()
            imageUrl = basicItem.image_url || ""
          }
        } catch (error) {
          console.error("Error loading basic item image:", error)
        }
      }

      itemsWithImages.push({
        ...item,
        imageUrl,
      })
    }

    return itemsWithImages
  }

  const getBasicItemImage = async (basicItemId: number): Promise<string | null> => {
    try {
      const response = await fetch(`/api/basic-items/${basicItemId}`)
      if (response.ok) {
        const data = await response.json()
        return data.image_url || null
      }
      return null
    } catch (error) {
      console.error("Error getting basic item image:", error)
      return null
    }
  }

  const saveItemToDatabase = async (item: ResponseItem, imageUrl: string | null): Promise<boolean> => {
    try {
      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_name: item.item_name,
          size_type: "unknown",
          material: item.material,
          style: item.style,
          has_print: item.has_print,
          color: item.color,
          shade: item.shade,
          has_details: item.has_details,
          url: "",
          image_url: imageUrl,
          is_basic: false,
          basic_item_id: item.basic_item_id,
          notes: item.description,
          basic_material_id: null,
          is_hidden: false,
        }),
      })

      return response.ok
    } catch (error) {
      console.error("Error saving item to database:", error)
      return false
    }
  }

  const handleSaveItem = async (item: ItemWithImage, index: number) => {
    try {
      let imageUrl: string | null = null

      // Если есть img_url (новое изображение), скачиваем и загружаем в blob
      if (item.img_url) {
        imageUrl = await downloadAndUploadImage(item.img_url)
      }
      // Если есть image_url (старое изображение), используем как есть
      else if (item.image_url) {
        imageUrl = item.image_url
      }
      // Если есть basic_item_id, получаем изображение базовой вещи
      else if (item.basic_item_id) {
        imageUrl = await getBasicItemImage(item.basic_item_id)
      }

      const success = await saveItemToDatabase(item, imageUrl)

      if (success) {
        setSavedItems((prev) => [...prev, index])
        toast({
          title: "Успешно!",
          description: `Вещь "${item.item_name}" добавлена в гардероб`,
        })
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось сохранить вещь",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при сохранении",
        variant: "destructive",
      })
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)
    setResponseItems([])
    setSavedItems([])

    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      // Используем оригинальный AI API для анализа изображения
      const response = await fetch("https://primary-production-84ad.up.railway.app/webhook/ai-photo-parse", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()

        if (Array.isArray(data) && data.length > 0) {
          const itemsWithImages = await loadItemImages(data)
          setResponseItems(itemsWithImages)
          toast({
            title: "Успешно!",
            description: `Найдено ${data.length} вещей для добавления в гардероб`,
          })
        } else {
          toast({
            title: "Успешно!",
            description: "Изображение обработано",
          })
        }
      } else {
        throw new Error("Ошибка отправки")
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось отправить изображение",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <Upload className="h-5 w-5" />
            Загрузить фото для анализа
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-indigo-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl || "/placeholder.svg"}
                  alt="Preview"
                  className="max-w-full max-h-48 mx-auto rounded-lg object-contain"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile()
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <ImageIcon className="h-12 w-12 mx-auto text-indigo-400" />
                <p className="text-indigo-700">Перетащите изображение сюда или нажмите для выбора</p>
                <p className="text-sm text-indigo-500">Поддерживаются JPG, PNG, WebP до 10MB</p>
              </div>
            )}
          </div>

          <input id="file-input" type="file" accept="image/*" onChange={handleFileInput} className="hidden" />

          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || isUploading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Анализируем...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Переложить вещи в гардероб
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Отображение найденных вещей */}
      {responseItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Найденные вещи ({responseItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {responseItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  {/* Изображение - основной акцент */}
                  <div className="mb-4">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl || "/placeholder.svg"}
                        alt={item.item_name}
                        className="w-full h-48 object-contain rounded-lg border bg-gray-50"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-200 rounded-lg border flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Основная информация */}
                  <div className="space-y-2 mb-4">
                    <h3 className="font-semibold text-lg text-center">{item.item_name}</h3>
                    <p className="text-gray-600 text-center">
                      <span className="font-medium">Материал:</span> {item.material}
                    </p>
                  </div>

                  {/* Кнопка сохранения */}
                  <div className="w-full">
                    {savedItems.includes(index) ? (
                      <Button disabled className="w-full bg-green-600">
                        <Check className="h-4 w-4 mr-2" />
                        Сохранено
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSaveItem(item, index)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                      >
                        Добавить в гардероб
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
