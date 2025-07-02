"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, X, Plus } from "lucide-react"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"
import { PastelLoader } from "./pastel-loader"

interface ClothingItem {
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

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzedItems, setAnalyzedItems] = useState<ClothingItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setAnalyzedItems([])
    }
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    setIsAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const response = await fetch(process.env.NEXT_PUBLIC_AI_API_URL!, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Ошибка анализа изображения")
      }

      const data = await response.json()
      console.log("AI Analysis result:", data)

      if (Array.isArray(data) && data.length > 0) {
        setAnalyzedItems(data)
        toast({
          title: "Анализ завершен",
          description: `Найдено ${data.length} ${data.length === 1 ? "вещь" : data.length < 5 ? "вещи" : "вещей"}`,
        })
      } else {
        toast({
          title: "Вещи не найдены",
          description: "На изображении не удалось найти одежду",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error analyzing image:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось проанализировать изображение",
        variant: "destructive",
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSaveItems = async () => {
    if (analyzedItems.length === 0) return

    setIsSaving(true)
    try {
      const response = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: analyzedItems }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Ошибка сохранения")
      }

      toast({
        title: "Успешно сохранено",
        description: `${analyzedItems.length} ${analyzedItems.length === 1 ? "вещь добавлена" : analyzedItems.length < 5 ? "вещи добавлены" : "вещей добавлено"} в гардероб`,
      })

      // Сброс формы
      setSelectedFile(null)
      setPreviewUrl(null)
      setAnalyzedItems([])
    } catch (error) {
      console.error("Error saving items:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить вещи в гардероб",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const clearSelection = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setAnalyzedItems([])
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Загрузка изображения */}
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-8">
          <div className="text-center space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Добавить вещи в гардероб</h2>
              <p className="text-gray-600">Загрузите фото одежды, и мы автоматически определим все вещи</p>
            </div>

            {!previewUrl ? (
              <div className="border-2 border-dashed border-gray-300 rounded-2xl p-12 hover:border-gray-400 transition-colors">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium text-gray-700">Выберите изображение</p>
                  <p className="text-sm text-gray-500">PNG, JPG до 10MB</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative inline-block">
                  <Image
                    src={previewUrl || "/placeholder.svg"}
                    alt="Preview"
                    width={400}
                    height={400}
                    className="rounded-2xl object-cover shadow-lg"
                  />
                  <Button
                    onClick={clearSelection}
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 rounded-full h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex gap-4 justify-center">
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="rounded-full px-8 py-3 bg-gray-800 hover:bg-gray-700"
                  >
                    {isAnalyzing ? (
                      <>
                        <PastelLoader size={20} />
                        <span className="ml-3">Анализируем...</span>
                      </>
                    ) : (
                      "Найти вещи"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Результаты анализа */}
      {analyzedItems.length > 0 && (
        <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Найденные вещи</h3>
                <p className="text-gray-600">Проверьте и сохраните в свой гардероб</p>
              </div>
              <Button
                onClick={handleSaveItems}
                disabled={isSaving}
                className="rounded-full px-6 py-2 bg-gray-800 hover:bg-gray-700"
              >
                {isSaving ? (
                  <>
                    <PastelLoader size={16} />
                    <span className="ml-2">Сохраняем...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить в гардероб
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analyzedItems.map((item) => (
                <Card
                  key={item.index}
                  className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square relative bg-gray-50">
                    {item.img_url || item.image_url ? (
                      <Image
                        src={item.img_url || item.image_url || "/placeholder.svg"}
                        alt={item.item_name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-gray-400 text-center">
                          <div className="w-12 h-12 mx-auto mb-2 bg-gray-200 rounded-lg flex items-center justify-center">
                            <span className="text-xl">👕</span>
                          </div>
                          <p className="text-sm">Нет изображения</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{item.item_name}</h4>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.basic_item_id && (
                        <Badge variant="default" className="text-xs px-2 py-1 rounded-full bg-gray-800 text-white">
                          Базовая вещь
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs px-2 py-1 rounded-full">
                        {item.material}
                      </Badge>
                      <Badge variant="outline" className="text-xs px-2 py-1 rounded-full">
                        {item.shade}
                      </Badge>
                      {item.style && (
                        <Badge variant="outline" className="text-xs px-2 py-1 rounded-full">
                          {item.style}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
