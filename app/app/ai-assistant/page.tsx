"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Mic, Camera, Sparkles, Upload, Loader2, Check } from "lucide-react"
import { AIAssistantLoader } from "@/components/ai-assistant-loader"
import Image from "next/image"

interface UserRecommendation {
  id: string
  title: string
  description: string
  items: Array<{
    type: string
    id: number
    name: string
    image_url: string
    color: string
  }>
}

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

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  outfit?: UserRecommendation
  photoAnalysis?: ItemWithImage[]
  isWaitingForPhoto?: boolean
  uploadedPhoto?: string
}

export default function AIAssistantPage() {
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isWaitingForPhoto, setIsWaitingForPhoto] = useState(false)
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const fetchRandomRecommendation = async (): Promise<UserRecommendation | null> => {
    try {
      const response = await fetch("/api/user-recommendations")
      if (!response.ok) {
        throw new Error("Failed to fetch recommendations")
      }

      const recommendations: UserRecommendation[] = await response.json()

      if (recommendations.length === 0) {
        return null
      }

      // Получаем случайную рекомендацию
      const randomIndex = Math.floor(Math.random() * recommendations.length)
      return recommendations[randomIndex]
    } catch (error) {
      console.error("Error fetching recommendations:", error)
      return null
    }
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

  const analyzePhoto = async (file: File): Promise<ItemWithImage[]> => {
    const formData = new FormData()
    formData.append("image", file)

    // Используем переменную окружения для AI API
    const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"

    // Увеличиваем таймаут и добавляем обработку ошибок
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 минуты таймаут

    try {
      const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        // Добавляем заголовки для стабильности соединения
        headers: {
          Accept: "application/json",
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("AI API Error Response:", errorText)
        throw new Error(`Ошибка анализа изображения: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log("AI Response:", data)

      if (Array.isArray(data) && data.length > 0) {
        return await loadBasicItemImages(data)
      } else {
        throw new Error("Не удалось найти вещи на изображении")
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error.name === "AbortError") {
        throw new Error("Превышено время ожидания анализа изображения")
      }

      console.error("AI Analysis Error:", error)
      throw error
    }
  }

  const handleSaveItem = async (item: ItemWithImage, messageIndex: number, itemIndex: number) => {
    try {
      // Обновляем состояние - показываем что добавляем
      setMessages((prev) =>
        prev.map((msg, msgIdx) => {
          if (msgIdx === messageIndex && msg.photoAnalysis) {
            return {
              ...msg,
              photoAnalysis: msg.photoAnalysis.map((analysisItem, analysisIdx) =>
                analysisIdx === itemIndex ? { ...analysisItem, isAdding: true } : analysisItem,
              ),
            }
          }
          return msg
        }),
      )

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
      setMessages((prev) =>
        prev.map((msg, msgIdx) => {
          if (msgIdx === messageIndex && msg.photoAnalysis) {
            return {
              ...msg,
              photoAnalysis: msg.photoAnalysis.map((analysisItem, analysisIdx) =>
                analysisIdx === itemIndex ? { ...analysisItem, isAdding: false, isAdded: true } : analysisItem,
              ),
            }
          }
          return msg
        }),
      )
    } catch (error) {
      console.error("Error saving item:", error)
      // Сбрасываем состояние при ошибке
      setMessages((prev) =>
        prev.map((msg, msgIdx) => {
          if (msgIdx === messageIndex && msg.photoAnalysis) {
            return {
              ...msg,
              photoAnalysis: msg.photoAnalysis.map((analysisItem, analysisIdx) =>
                analysisIdx === itemIndex ? { ...analysisItem, isAdding: false } : analysisItem,
              ),
            }
          }
          return msg
        }),
      )
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !isWaitingForPhoto) return

    // Создаем URL для предпросмотра
    const photoPreview = URL.createObjectURL(file)

    // Добавляем сообщение пользователя с фото
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: "Вот фото для анализа:",
        uploadedPhoto: photoPreview,
      },
    ])

    setIsAnalyzingPhoto(true)
    setIsWaitingForPhoto(false)

    try {
      const analysisResults = await analyzePhoto(file)

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Отлично! Я проанализировал ваше фото и нашел ${analysisResults.length} ${
            analysisResults.length === 1 ? "вещь" : analysisResults.length < 5 ? "вещи" : "вещей"
          }:`,
          photoAnalysis: analysisResults,
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Произошла ошибка при анализе фото. Попробуйте еще раз с другим изображением.",
        },
      ])
    } finally {
      setIsAnalyzingPhoto(false)
      // Очищаем input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleQuickAction = async (actionText: string) => {
    setMessages((prev) => [...prev, { role: "user", content: actionText }])
    setIsLoading(true)

    if (actionText === "Подобрать образ на сегодня") {
      try {
        const recommendation = await fetchRandomRecommendation()

        if (recommendation) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Отличный выбор! Вот образ "${recommendation.title}" из ваших вещей:`,
              outfit: recommendation,
            },
          ])
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "К сожалению, у вас пока нет сохраненных образов. Добавьте вещи в гардероб, и я смогу подобрать для вас стильные сочетания!",
            },
          ])
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Произошла ошибка при подборе образа. Попробуйте еще раз.",
          },
        ])
      }
    } else if (actionText === "Проанализировать фото") {
      setIsWaitingForPhoto(true)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Отправьте мне фото одежды, и я проанализирую, какие вещи на нем изображены!",
          isWaitingForPhoto: true,
        },
      ])
    } else {
      // Для других кнопок - обычный ответ
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Эта функция пока в разработке. Задайте вопрос в текстовом виде!",
          },
        ])
        setIsLoading(false)
      }, 1500)
      return
    }

    setIsLoading(false)
  }

  const handleSend = async () => {
    if (!message.trim()) return

    const userMessage = message
    setMessage("")
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])
    setIsLoading(true)

    // Simulate AI response with cute message
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Ещё чуть-чуть и мы сможем поболтать! 💫 А пока попробуйте кнопки выше для быстрых действий.",
        },
      ])
      setIsLoading(false)
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
        onChange={handleFileSelect}
        className="hidden"
        id="photo-upload"
      />

      {/* Header */}
      <div className="px-6 py-4">
        <div className="text-center">
          <h1 className="text-xl font-serif font-bold text-gray-900">ИИ-Ассистент</h1>
          <p className="text-sm text-gray-600">Ваш персональный стилист</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 px-4 py-6 overflow-y-auto pb-40">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-8">
              <AIAssistantLoader size={80} />
            </div>
            <h2 className="text-xl font-serif font-semibold text-gray-900 mb-4">Привет! Я ваш стилист-ассистент</h2>
            <p className="text-gray-600 mb-8 max-w-sm">
              Задайте вопрос о стиле, попросите подобрать образ или получите советы по гардеробу
            </p>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 gap-3 w-full max-w-sm">
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => handleQuickAction("Подобрать образ на сегодня")}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Подобрать образ на сегодня
              </Button>
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => handleQuickAction("Проанализировать фото")}
              >
                <Camera className="w-4 h-4 mr-2" />
                Проанализировать фото
              </Button>
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => handleQuickAction("Дать совет по стилю")}
              >
                <Mic className="w-4 h-4 mr-2" />
                Дать совет по стилю
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs ${msg.role === "user" ? "bg-gray-900 text-white" : "bg-white"} rounded-lg`}>
                  <Card className={msg.role === "user" ? "bg-gray-900 text-white border-gray-900" : "bg-white"}>
                    <CardContent className="p-3">
                      <p className="text-sm">{msg.content}</p>

                      {/* Uploaded Photo Display */}
                      {msg.uploadedPhoto && (
                        <div className="mt-3">
                          <div className="relative w-full max-w-xs">
                            <img
                              src={msg.uploadedPhoto || "/placeholder.svg"}
                              alt="Uploaded photo"
                              className="w-full h-auto rounded-lg object-cover max-h-48"
                            />
                          </div>
                        </div>
                      )}

                      {/* Photo upload button for waiting state */}
                      {msg.isWaitingForPhoto && (
                        <div className="mt-3">
                          <Button
                            onClick={() => fileInputRef.current?.click()}
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Выбрать фото
                          </Button>
                        </div>
                      )}

                      {/* Outfit Display */}
                      {msg.outfit && (
                        <div className="mt-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {msg.outfit.items.slice(0, 4).map((item, itemIndex) => (
                              <div key={itemIndex} className="bg-gray-50 rounded-lg p-1 text-center">
                                <div className="aspect-square w-full bg-gray-100 rounded overflow-hidden mb-1">
                                  <img
                                    src={item.image_url || "/placeholder.svg"}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <p className="text-xs text-gray-600 truncate">{item.name}</p>
                              </div>
                            ))}
                          </div>
                          {msg.outfit.items.length > 4 && (
                            <p className="text-xs text-gray-500 text-center">+{msg.outfit.items.length - 4} еще</p>
                          )}
                        </div>
                      )}

                      {/* Photo Analysis Results */}
                      {msg.photoAnalysis && (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-1 gap-3">
                            {msg.photoAnalysis.map((item, itemIndex) => (
                              <Card key={itemIndex} className="overflow-hidden bg-gray-50">
                                <CardContent className="p-2">
                                  <div className="flex gap-2">
                                    {/* Изображение */}
                                    <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                                      {item.finalImageUrl ? (
                                        <Image
                                          src={item.finalImageUrl || "/placeholder.svg"}
                                          alt={item.item_name}
                                          width={64}
                                          height={64}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <span className="text-lg">👕</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Информация */}
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium text-xs text-gray-900 mb-1 line-clamp-2">
                                        {item.item_name}
                                      </h4>

                                      <div className="flex flex-wrap gap-1 mb-2">
                                        {item.basic_item_id && (
                                          <Badge variant="default" className="text-xs px-1 py-0 h-4">
                                            Базовая
                                          </Badge>
                                        )}
                                        <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                                          {item.material}
                                        </Badge>
                                        {item.shade && (
                                          <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                                            {item.shade}
                                          </Badge>
                                        )}
                                      </div>

                                      <Button
                                        onClick={() => handleSaveItem(item, index, itemIndex)}
                                        disabled={item.isAdding || item.isAdded}
                                        className="w-full h-6 text-xs"
                                        variant={item.isAdded ? "secondary" : "default"}
                                        size="sm"
                                      >
                                        {item.isAdding ? (
                                          <>
                                            <Loader2 className="h-2 w-2 mr-1 animate-spin" />
                                            Добавляем...
                                          </>
                                        ) : item.isAdded ? (
                                          <>
                                            <Check className="h-2 w-2 mr-1" />
                                            Добавлено
                                          </>
                                        ) : (
                                          "Добавить"
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ))}

            {(isLoading || isAnalyzingPhoto) && (
              <div className="flex justify-start">
                <Card className="bg-white">
                  <CardContent className="p-3">
                    <AIAssistantLoader size={24} />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Invisible div to scroll to */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom area with suggestion and input - Fixed position */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-200">
        {/* Quick suggestions above input */}
        {messages.length > 0 && !isWaitingForPhoto && (
          <div className="px-4 py-2 border-b border-gray-200">
            <div className="max-w-2xl mx-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                onClick={() => handleQuickAction("Подобрать образ на сегодня")}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Подобрать образ на сегодня
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                onClick={() => handleQuickAction("Проанализировать фото")}
              >
                <Camera className="w-3 h-3 mr-1" />
                Проанализировать фото
              </Button>
            </div>
          </div>
        )}

        {/* Photo upload area when waiting for photo */}
        {isWaitingForPhoto && (
          <div className="px-4 py-2 border-b border-gray-200">
            <div className="max-w-2xl mx-auto">
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
                className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                disabled={isAnalyzingPhoto}
              >
                {isAnalyzingPhoto ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Анализируем...
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3 mr-1" />
                    Выбрать фото
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="px-4 py-4 pb-24">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isWaitingForPhoto ? "Выберите фото выше..." : "Спросите что-нибудь о стиле..."}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              className="flex-1"
              disabled={isWaitingForPhoto}
            />
            <Button onClick={handleSend} disabled={!message.trim() || isLoading || isWaitingForPhoto}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
