"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Upload, X, Loader2, Check, Plus, AlertCircle } from "lucide-react"
import { AIAssistantLoader } from "@/components/ai-assistant-loader"
import Image from "next/image"

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

interface RejectedPhoto {
  acceptable: false
  reason: string
  headers?: any
  params?: any
  query?: any
  body?: any
  webhookUrl?: string
  executionMode?: string
}

interface ItemWithImage extends ResponseItem {
  finalImageUrl?: string
  isAdding?: boolean
  isAdded?: boolean
}

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

interface PhotoAnalysisResult {
  success: boolean
  items: ItemWithImage[]
  error?: string
  rejectionReason?: string
  fileName: string
}

interface PhotoAnalysisFormProps {
  initialPhotos?: UploadedPhoto[]
  onSuccess?: () => void
  onReset?: () => void
}

export function PhotoAnalysisForm({ initialPhotos = [], onSuccess, onReset }: PhotoAnalysisFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState("")
  const [results, setResults] = useState<ItemWithImage[]>([])
  const [analysisResults, setAnalysisResults] = useState<PhotoAnalysisResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [needsReanalysis, setNeedsReanalysis] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Автоматически запускаем анализ если есть начальные фото
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0 && !hasAnalyzed) {
      // Ограничиваем до 2 фото
      const limitedPhotos = initialPhotos.slice(0, 2)
      setSelectedFiles(limitedPhotos)
      handleAnalyze(limitedPhotos)
    }
  }, [initialPhotos])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Ограничиваем общее количество фото до 2
    const remainingSlots = 2 - selectedFiles.length
    const filesToAdd = files.slice(0, remainingSlots)

    if (filesToAdd.length === 0) {
      setError("Максимум 2 фото для анализа")
      return
    }

    const newPhotos: UploadedPhoto[] = filesToAdd.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
    }))

    setSelectedFiles((prev) => [...prev, ...newPhotos])

    // Если уже были результаты, показываем что нужен повторный анализ
    if (results.length > 0) {
      setNeedsReanalysis(true)
    }

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
      const newFiles = prev.filter((p) => p.id !== id)

      // Если удалили все фото, полностью сбрасываем состояние
      if (newFiles.length === 0) {
        setResults([])
        setAnalysisResults([])
        setHasAnalyzed(false)
        setNeedsReanalysis(false)
        setError(null)
        setLoading(false) // Важно: останавливаем загрузку
        setProgress(0)
        setProgressText("")
      } else if (results.length > 0) {
        // Если есть результаты и остались фото, нужен повторный анализ
        setNeedsReanalysis(true)
      }

      return newFiles
    })
  }

  const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
      // Скачиваем изображение
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

  const analyzePhoto = async (file: File): Promise<PhotoAnalysisResult> => {
    const formData = new FormData()
    formData.append("image", file)

    // Используем переменную окружения для AI API
    const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"

    // Добавляем таймаут и улучшенную обработку ошибок
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 минуты

    try {
      const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("AI API Error Response:", errorText)
        return {
          success: false,
          items: [],
          error: `Ошибка анализа: ${response.status} ${response.statusText}`,
          fileName: file.name,
        }
      }

      const data = await response.json()
      console.log("AI Response:", data)

      // Проверяем, является ли ответ массивом с отклонением
      if (Array.isArray(data) && data.length > 0 && data[0].acceptable === false) {
        const rejectedItem = data[0] as RejectedPhoto
        return {
          success: false,
          items: [],
          rejectionReason: rejectedItem.reason,
          fileName: file.name,
        }
      }

      // Проверяем, является ли ответ массивом с вещами
      if (Array.isArray(data) && data.length > 0 && data[0].item_name) {
        const itemsWithImages = await loadBasicItemImages(data)
        return {
          success: true,
          items: itemsWithImages,
          fileName: file.name,
        }
      }

      // Если ответ не подходит ни под один формат
      return {
        success: false,
        items: [],
        error: "Не удалось найти вещи на изображении",
        fileName: file.name,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error.name === "AbortError") {
        return {
          success: false,
          items: [],
          error: "Превышено время ожидания анализа изображения",
          fileName: file.name,
        }
      }

      console.error("AI Analysis Error:", error)
      return {
        success: false,
        items: [],
        error: `Ошибка анализа: ${error.message}`,
        fileName: file.name,
      }
    }
  }

  const handleAnalyze = async (photosToAnalyze?: UploadedPhoto[]) => {
    const photos = photosToAnalyze || selectedFiles
    if (photos.length === 0) return

    setLoading(true)
    setError(null)
    setHasAnalyzed(true)
    setNeedsReanalysis(false)
    setResults([]) // Очищаем предыдущие результаты
    setAnalysisResults([]) // Очищаем результаты анализа
    setProgress(0)
    setProgressText("Подготовка к анализу...")

    // Начальный прогресс
    setProgress(10)
    setProgressText("Загружаем фото...")

    try {
      // Анализируем каждое фото с обновлением прогресса
      const analysisResults: PhotoAnalysisResult[] = []
      const progressStep = 60 / photos.length // 60% делим на количество фото

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        setProgressText(`Анализируем фото ${i + 1} из ${photos.length}...`)

        const result = await analyzePhoto(photo.file)
        analysisResults.push(result)

        // Обновляем прогресс после каждого фото
        const currentProgress = 10 + (i + 1) * progressStep
        setProgress(currentProgress)
      }

      setProgress(70)
      setProgressText("Загружаем изображения базовых вещей...")

      // Собираем все успешные результаты
      const allSuccessfulItems: ItemWithImage[] = []
      const failedAnalyses: PhotoAnalysisResult[] = []

      analysisResults.forEach((result) => {
        if (result.success) {
          allSuccessfulItems.push(...result.items)
        } else {
          failedAnalyses.push(result)
        }
      })

      setProgress(90)
      setProgressText("Завершаем обработку...")

      // Устанавливаем результаты
      setResults(allSuccessfulItems)
      setAnalysisResults(analysisResults)

      // Если есть хотя бы один успешный результат, не показываем общую ошибку
      if (allSuccessfulItems.length === 0 && failedAnalyses.length > 0) {
        setError("Не удалось проанализировать ни одно изображение")
      }

      setProgress(100)
      setProgressText("Анализ завершен!")

      // Через секунду скрываем прогресс бар
      setTimeout(() => {
        setLoading(false)
        setProgress(0)
        setProgressText("")
      }, 1000)
    } catch (error) {
      console.error("Analysis error:", error)
      setError("Произошла ошибка при анализе фото")
      setLoading(false)
      setProgress(0)
      setProgressText("")
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

  const handleClear = () => {
    // Освобождаем URL объекты
    selectedFiles.forEach((photo) => {
      URL.revokeObjectURL(photo.preview)
    })

    // Полностью сбрасываем все состояния
    setSelectedFiles([])
    setResults([])
    setAnalysisResults([])
    setError(null)
    setHasAnalyzed(false)
    setLoading(false) // Важно: останавливаем загрузку
    setNeedsReanalysis(false)
    setProgress(0)
    setProgressText("")

    // Очищаем input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    // Вызываем callback для родительского компонента
    onReset?.()
  }

  const ProgressLoader = () => (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="flex justify-center mb-4">
          <AIAssistantLoader size={48} />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">ИИ анализирует ваши фото</h3>
        <p className="text-gray-400 text-sm mb-4">
          Наш искусственный интеллект распознает одежду на изображениях
          <br />и подберет подходящие вещи для вашего гардероба
        </p>

        {/* Прогресс бар с градиентом */}
        <div className="w-full max-w-md mx-auto space-y-3">
          <div className="relative">
            <Progress value={progress} className="h-3 bg-gray-700" />
            <div
              className="absolute top-0 left-0 h-3 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #8B5CF6 0%, #A855F7 25%, #C084FC 50%, #E879F9 75%, #F0ABFC 100%)",
              }}
            />
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">{progressText}</span>
            <span className="text-white font-medium">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* Header with Clear Button - показываем только если есть результаты или фото */}
        {(hasAnalyzed || selectedFiles.length > 0) && !loading && (
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">
              {selectedFiles.length > 0 ? "Анализ фото" : "Результаты анализа"}
            </h3>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <X className="h-3 w-3 mr-1" />
              Очистить
            </Button>
          </div>
        )}

        {/* Photos Section - показываем только если есть фото и не загружаем */}
        {selectedFiles.length > 0 && !loading && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Загруженные фото ({selectedFiles.length})</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedFiles.map((photo) => (
                    <div key={photo.id} className="relative group">
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={photo.preview || "/placeholder.svg"}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error("Image load error:", e)
                            // Удаляем фото с битой ссылкой
                            removePhoto(photo.id)
                          }}
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

                  {/* Add More Button - показываем только если меньше 2 фото */}
                  {selectedFiles.length < 2 && (
                    <div className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
                        onChange={handleFileSelect}
                        className="hidden"
                        multiple
                      />
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer flex flex-col items-center justify-center space-y-1 p-4 text-center"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus className="h-6 w-6 text-gray-400" />
                        <span className="text-xs text-gray-600">Добавить еще</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Кнопка анализа - показываем если не анализировали или нужен повторный анализ */}
                {(!hasAnalyzed || needsReanalysis) && selectedFiles.length > 0 && (
                  <Button onClick={() => handleAnalyze()} disabled={loading} className="w-full" size="sm">
                    {loading ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Анализируем...
                      </>
                    ) : (
                      `Найти вещи на ${selectedFiles.length} ${selectedFiles.length === 1 ? "фото" : "фото"}`
                    )}
                  </Button>
                )}

                {error && <div className="text-red-600 text-xs bg-red-50 p-2 rounded-lg">{error}</div>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Section - показываем только если нет фото и не загружаем */}
        {selectedFiles.length === 0 && !loading && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <h3 className="text-base font-semibold">Загрузить фото одежды</h3>
                <p className="text-xs text-gray-500">Максимум 2 фото для анализа</p>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
                    onChange={handleFileSelect}
                    className="hidden"
                    multiple
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 text-gray-400" />
                    <span className="text-xs text-gray-600 text-center">
                      Нажмите для выбора фото
                      <br />
                      <span className="text-gray-500">HEIC, JPEG, JPG, WebP, PNG</span>
                    </span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading Section - показываем только когда идет загрузка */}
        {loading && <ProgressLoader />}

        {/* Analysis Results Section - показываем ошибки и отклонения */}
        {!loading && hasAnalyzed && analysisResults.length > 0 && (
          <div className="space-y-3">
            {analysisResults.some((result) => !result.success) && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white">Проблемы с анализом</h4>
                {analysisResults.map((result, index) => {
                  if (result.success) return null

                  return (
                    <Card key={index} className="border-orange-200 bg-orange-50">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-orange-800">
                              Фото #{index + 1}: {result.fileName}
                            </p>
                            <p className="text-xs text-orange-600 mt-1">{result.rejectionReason || result.error}</p>
                            {result.rejectionReason && (
                              <p className="text-xs text-orange-500 mt-1">Попробуйте загрузить другое изображение</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Results Section - показываем только если есть результаты и не загружаем */}
        {!loading && results.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-white">Найденные вещи ({results.length})</h3>
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
