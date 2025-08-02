"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Upload, X, Loader2, Camera } from "lucide-react"
import { toast } from "sonner"

interface AnalysisResult {
  id: string
  name: string
  color: string
  material: string
  category: string
  confidence: number
  image_url?: string
}

interface ProgressLoaderProps {
  progress: number
  text: string
}

function ProgressLoader({ progress, text }: ProgressLoaderProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 text-sm text-gray-600 mb-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {text}
        </div>
        <div className="text-xs text-gray-500">{progress}%</div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-300 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export function PhotoAnalysisForm() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState("")

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const imageFiles = files.filter((file) => file.type.startsWith("image/"))

    if (imageFiles.length !== files.length) {
      toast.error("Можно загружать только изображения")
    }

    setSelectedFiles((prev) => [...prev, ...imageFiles].slice(0, 5)) // Максимум 5 файлов
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    setSelectedFiles([])
    setResults([])
    setProgress(0)
    setProgressText("")
  }

  const analyzePhotos = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Выберите хотя бы одно фото")
      return
    }

    setIsAnalyzing(true)
    setResults([])
    setProgress(10)
    setProgressText("Подготовка к анализу...")

    try {
      const allResults: AnalysisResult[] = []
      const progressPerPhoto = 60 / selectedFiles.length

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setProgressText(`Анализируем фото ${i + 1} из ${selectedFiles.length}...`)

        const formData = new FormData()
        formData.append("image", file)

        const response = await fetch("/api/webhook/ai-photo-parse", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`Ошибка анализа фото ${i + 1}`)
        }

        const result = await response.json()

        if (result.items && Array.isArray(result.items)) {
          const photoResults = result.items.map((item: any, index: number) => ({
            id: `${i}-${index}`,
            name: item.name || "Неизвестная вещь",
            color: item.color || "Неизвестный цвет",
            material: item.material || "Неизвестный материал",
            category: item.category || "Неизвестная категория",
            confidence: item.confidence || 0,
            image_url: item.image_url,
          }))

          allResults.push(...photoResults)
        }

        setProgress(10 + (i + 1) * progressPerPhoto)
      }

      // Загружаем изображения базовых вещей
      setProgressText("Загружаем изображения...")
      setProgress(70)

      const basicItemsResponse = await fetch("/api/basic-wardrobe-items")
      if (basicItemsResponse.ok) {
        const basicItems = await basicItemsResponse.json()

        // Обогащаем результаты изображениями из базовых вещей
        const enrichedResults = allResults.map((result) => {
          const matchingBasicItem = basicItems.find(
            (item: any) =>
              item.name_ru?.toLowerCase().includes(result.name.toLowerCase()) ||
              result.name.toLowerCase().includes(item.name_ru?.toLowerCase()),
          )

          return {
            ...result,
            image_url: matchingBasicItem?.image_url || result.image_url,
          }
        })

        setResults(enrichedResults)
      } else {
        setResults(allResults)
      }

      setProgress(90)
      setProgressText("Завершаем обработку...")

      setTimeout(() => {
        setProgress(100)
        setProgressText("Анализ завершен!")

        setTimeout(() => {
          setProgress(0)
          setProgressText("")
        }, 1000)
      }, 500)

      toast.success(`Найдено ${allResults.length} вещей`)
    } catch (error) {
      console.error("Ошибка анализа:", error)
      toast.error("Ошибка при анализе фото")
      setProgress(0)
      setProgressText("")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const addToWardrobe = async (result: AnalysisResult) => {
    try {
      const response = await fetch("/api/wardrobe/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_name: result.name,
          color: result.color,
          material: result.material,
          category: result.category,
          image_url: result.image_url,
          source: "ai_analysis",
        }),
      })

      if (response.ok) {
        toast.success(`"${result.name}" добавлено в гардероб`)
        setResults((prev) => prev.filter((r) => r.id !== result.id))
      } else {
        throw new Error("Ошибка добавления в гардероб")
      }
    } catch (error) {
      console.error("Ошибка добавления в гардероб:", error)
      toast.error("Ошибка добавления в гардероб")
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Анализ фото одежды
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Загрузка файлов */}
        <div className="space-y-4">
          <Label htmlFor="photo-upload">Выберите фото одежды (до 5 штук)</Label>
          <div className="flex items-center gap-4">
            <Input
              id="photo-upload"
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("photo-upload")?.click()}
              disabled={isAnalyzing}
            >
              <Upload className="w-4 h-4 mr-2" />
              Выбрать фото
            </Button>
            {selectedFiles.length > 0 && (
              <Button variant="ghost" onClick={clearAll} disabled={isAnalyzing}>
                Очистить все
              </Button>
            )}
          </div>
        </div>

        {/* Превью выбранных файлов */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <Label>Выбранные фото ({selectedFiles.length}/5)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {selectedFiles.map((file, index) => (
                <div key={index} className="relative group">
                  <img
                    src={URL.createObjectURL(file) || "/placeholder.svg"}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
                    onClick={() => removeFile(index)}
                    disabled={isAnalyzing}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Кнопка анализа */}
        <Button onClick={analyzePhotos} disabled={selectedFiles.length === 0 || isAnalyzing} className="w-full">
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Анализируем...
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-2" />
              Анализировать фото
            </>
          )}
        </Button>

        {/* Прогресс бар */}
        {isAnalyzing && progress > 0 && <ProgressLoader progress={progress} text={progressText} />}

        {/* Результаты анализа */}
        {results.length > 0 && (
          <div className="space-y-4">
            <Label>Найденные вещи ({results.length})</Label>
            <div className="grid gap-4">
              {results.map((result) => (
                <Card key={result.id} className="p-4">
                  <div className="flex items-start gap-4">
                    {result.image_url && (
                      <img
                        src={result.image_url || "/placeholder.svg"}
                        alt={result.name}
                        className="w-20 h-20 object-cover rounded-lg border flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">{result.name}</h4>
                        <Badge variant="secondary">{Math.round(result.confidence * 100)}%</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">Цвет: {result.color}</Badge>
                        <Badge variant="outline">Материал: {result.material}</Badge>
                        <Badge variant="outline">Категория: {result.category}</Badge>
                      </div>
                      <Button size="sm" onClick={() => addToWardrobe(result)} className="mt-2">
                        Добавить в гардероб
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
