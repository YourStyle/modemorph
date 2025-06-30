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
  b64_json?: string
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [responseItems, setResponseItems] = useState<ResponseItem[]>([])
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

  const saveBase64ToBlob = async (base64Data: string): Promise<string | null> => {
    try {
      // Конвертируем base64 в blob
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: "image/png" })

      // Создаем File объект
      const file = new File([blob], `wardrobe-item-${Date.now()}.png`, { type: "image/png" })

      // Отправляем в API для сохранения в blob storage
      const formData = new FormData()
      formData.append("file", file)
      formData.append("prefix", "users-wardrobe")

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        return data.url
      }
      return null
    } catch (error) {
      console.error("Error saving base64 to blob:", error)
      return null
    }
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
          size_type: "unknown", // Можно добавить в ответ API если нужно
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

  const handleSaveItem = async (item: ResponseItem, index: number) => {
    try {
      let imageUrl: string | null = null

      // Если есть base64 изображение, сохраняем в blob
      if (item.b64_json) {
        imageUrl = await saveBase64ToBlob(item.b64_json)
      }
      // Если есть basic_item_id, получаем изображение из базовых вещей
      else if (item.basic_item_id) {
        imageUrl = await getBasicItemImage(item.basic_item_id)
      }

      // Сохраняем в базу данных
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

      const response = await fetch(
        "https://primary-production-84ad.up.railway.app/webhook-test/ai-photo-parse",
        {
          method: "POST",
          body: formData,
        },
      )

      if (response.ok) {
        const data = await response.json()

        if (Array.isArray(data) && data.length > 0) {
          setResponseItems(data)
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
            <div className="space-y-4">
              {responseItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start gap-4">
                    {/* Изображение */}
                    <div className="flex-shrink-0">
                      {item.b64_json ? (
                        <img
                          src={`data:image/png;base64,${item.b64_json}`}
                          alt={item.item_name}
                          className="w-20 h-20 object-cover rounded-lg border"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-200 rounded-lg border flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Информация о вещи */}
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{item.item_name}</h3>
                      <p className="text-gray-600 text-sm mb-2">{item.description}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium">Цвет:</span> {item.color} ({item.shade})
                        </div>
                        <div>
                          <span className="font-medium">Материал:</span> {item.material}
                        </div>
                        <div>
                          <span className="font-medium">Стиль:</span> {item.style}
                        </div>
                        <div>
                          <span className="font-medium">Принт:</span> {item.has_print}
                        </div>
                        <div>
                          <span className="font-medium">Детали:</span> {item.has_details}
                        </div>
                        {item.basic_item_id && (
                          <div>
                            <span className="font-medium">Базовая вещь ID:</span> {item.basic_item_id}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Кнопка сохранения */}
                    <div className="flex-shrink-0">
                      {savedItems.includes(index) ? (
                        <Button disabled className="bg-green-600">
                          <Check className="h-4 w-4 mr-2" />
                          Сохранено
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleSaveItem(item, index)}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          Добавить в гардероб
                        </Button>
                      )}
                    </div>
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
