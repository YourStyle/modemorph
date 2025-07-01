"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Loader2, Check } from "lucide-react"
import Image from "next/image"
import { useToast } from "@/hooks/use-toast"

interface DetectedItem {
  index: number
  basic_item_id: string | null
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
  img_url: string
}

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [savedItems, setSavedItems] = useState<Set<number>>(new Set())
  const { toast } = useToast()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setDetectedItems([])
      setSavedItems(new Set())
    }
  }

  const analyzeImage = async () => {
    if (!selectedFile) return

    setIsAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Ошибка анализа изображения")
      }

      const data = await response.json()
      console.log("Received analysis data:", data)

      if (Array.isArray(data) && data.length > 0) {
        setDetectedItems(data)
        toast({
          title: "Анализ завершен",
          description: `Найдено ${data.length} вещей на изображении`,
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

  const saveItem = async (item: DetectedItem) => {
    setIsSaving(true)
    try {
      const itemData = {
        name: item.item_name,
        clothing_type: item.clothing_item,
        material: item.material,
        color: item.color,
        style: item.style,
        print: item.has_print === "yes" ? "есть" : "нет",
        image_url: item.img_url,
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

      setSavedItems((prev) => new Set([...prev, item.index]))
      toast({
        title: "Вещь сохранена",
        description: `${item.item_name} добавлена в ваш гардероб`,
      })
    } catch (error) {
      console.error("Error saving item:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить вещь",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const saveAllItems = async () => {
    setIsSaving(true)
    try {
      for (const item of detectedItems) {
        if (!savedItems.has(item.index)) {
          await saveItem(item)
          // Небольшая задержка между запросами
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
      toast({
        title: "Все вещи сохранены",
        description: "Все найденные вещи добавлены в ваш гардероб",
      })
    } catch (error) {
      console.error("Error saving all items:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить все вещи",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Загрузить фото одежды</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-4 text-gray-500" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Нажмите для загрузки</span> или перетащите файл
                </p>
                <p className="text-xs text-gray-500">PNG, JPG или WEBP (макс. 10MB)</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
            </label>
          </div>

          {previewUrl && (
            <div className="mt-4">
              <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                <Image src={previewUrl || "/placeholder.svg"} alt="Preview" fill className="object-contain" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={analyzeImage} disabled={isAnalyzing} className="flex-1">
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Анализируем...
                    </>
                  ) : (
                    "Найти одежду"
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {detectedItems.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Найденные вещи ({detectedItems.length})</CardTitle>
            <Button
              onClick={saveAllItems}
              disabled={isSaving || detectedItems.every((item) => savedItems.has(item.index))}
              size="sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохраняем...
                </>
              ) : (
                "Сохранить все"
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {detectedItems.map((item) => (
                <Card key={item.index} className="overflow-hidden">
                  <div className="aspect-square relative bg-gray-100">
                    <Image
                      src={item.img_url || "/placeholder.svg"}
                      alt={item.item_name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2">{item.item_name}</h3>
                    <p className="text-sm text-gray-600 mb-3">{item.description}</p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      <Badge variant="secondary">{item.material}</Badge>
                      <Badge variant="outline">{item.style}</Badge>
                      <Badge variant="outline" style={{ backgroundColor: item.color, color: "#fff" }}>
                        {item.shade}
                      </Badge>
                    </div>

                    <Button
                      onClick={() => saveItem(item)}
                      disabled={isSaving || savedItems.has(item.index)}
                      className="w-full"
                      size="sm"
                    >
                      {savedItems.has(item.index) ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Сохранено
                        </>
                      ) : isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Сохраняем...
                        </>
                      ) : (
                        "Добавить в гардероб"
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
  )
}
