"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Camera, Sparkles, Image as ImageIcon, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { PhotoAnalysisForm } from "@/components/photo-analysis-form"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import { useFeature } from "@/hooks/use-feature"
import { api } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useAnalytics } from "@/hooks/use-analytics"

interface Message {
  role: "user" | "assistant"
  content: string
  outfit?: UserRecommendation
}

interface UserRecommendation {
  id: string
  title: string
  description: string
  items: RecommendationItem[]
}

interface RecommendationItem {
  type: "clothing"
  id: number
  name: string
  image_url: string
  color: string
}

// Типы ответов от AI API
interface TrashResponse {
  type: "trash"
}

interface ContentResponse {
  content: string
}

interface OutfitResponse {
  id: string
  title: string
  description: string
  items: {
    id: string
    name: string
    user_id: string
    image_url: string
    color: string | null
    shade: string | null
    has_print: string
    notes: string | null
    url: string | null
  }[]
  suggested_items_count: number
}

type AIPromptResponse = TrashResponse | ContentResponse | OutfitResponse

const STORAGE_KEY = "ai_assistant_history"
const MAX_MESSAGES = 100

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Привет! Я помогу вам с образами и анализом одежды. Вы можете попросить подобрать образ на день или загрузить фото для анализа! 👗✨",
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [showPhotoForm, setShowPhotoForm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const { log, consume } = useFeature()
  const { trackEvent, trackOnce } = useAnalytics()

  useReconcileLimits(true)

  // Загрузка истории из localStorage при монтировании
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Message[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error)
    }
  }, [])

  // Сохранение истории в localStorage при изменении сообщений
  useEffect(() => {
    if (messages.length > 1) { // Пропускаем первое приветствие
      try {
        // Оставляем только последние 100 сообщений
        const messagesToSave = messages.slice(-MAX_MESSAGES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToSave))
      } catch (error) {
        console.error("Failed to save chat history:", error)
      }
    }
  }, [messages])

  useEffect(() => {
    // Получаем ID пользователя при загрузке
    const getUserId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
      }
    }
    getUserId()
  }, [supabase])

  useEffect(() => {
    // Автоскролл к последнему сообщению
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const getCurrentWeather = async () => {
    try {
      // Сначала пробуем получить кэшированную погоду
      try {
        const cachedWeather = await api.get("/api/weather/cached")
        return {
          temperature: cachedWeather.temperature,
          condition: cachedWeather.condition,
          description: cachedWeather.description,
          location: cachedWeather.location,
        }
      } catch (cachedError) {
        // Continue to geolocation if cached weather fails
      }

      // Если кэша нет, получаем текущую геолокацию
      return new Promise((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords
              try {
                try {
                  const weatherData = await api.get(`/api/weather?lat=${latitude}&lon=${longitude}`)
                  resolve({
                    temperature: weatherData.temperature,
                    condition: weatherData.condition,
                    description: weatherData.description,
                    location: weatherData.location,
                  })
                } catch (weatherError) {
                  resolve({
                    temperature: 20,
                    condition: "Clear",
                    description: "ясно",
                    location: "Москва",
                  })
                }
              } catch (error) {
                resolve({
                  temperature: 20,
                  condition: "Clear",
                  description: "ясно",
                  location: "Москва",
                })
              }
            },
            () => {
              // Fallback на Москву при ошибке геолокации
              resolve({
                temperature: 20,
                condition: "Clear",
                description: "ясно",
                location: "Москва",
              })
            },
          )
        } else {
          resolve({
            temperature: 20,
            condition: "Clear",
            description: "ясно",
            location: "Москва",
          })
        }
      })
    } catch (error) {
      console.error("Error getting weather:", error)
      return {
        temperature: 20,
        condition: "Clear",
        description: "ясно",
        location: "Москва",
      }
    }
  }

  const getAuthToken = async () => {
    const { sessionAuth } = await import("@/lib/tma/session-auth")
    return sessionAuth.getAccessToken()
  }

  const handleSend = async (customPrompt?: string) => {
    const messageToSend = customPrompt || inputValue.trim()
    if (!messageToSend || isLoading) return

    if (messageToSend.length < 20) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Пожалуйста, опишите ваш запрос более подробно (минимум 20 символов). Расскажите больше о том, что вас интересует! 😊",
        },
      ])
      return
    }

    if (messageToSend.length > 2000) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Ваш запрос слишком длинный (максимум 2000 символов). Попробуйте сократить его, сохранив основную суть! ✂️",
        },
      ])
      return
    }

    setMessages((prev) => [...prev, { role: "user", content: messageToSend }])
    setInputValue("")
    setIsLoading(true)

    try {
      // Получаем userId, если он еще не загружен
      let currentUserId = userId
      if (!currentUserId) {
        console.log("User ID not loaded yet, fetching...")
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          throw new Error("User not authenticated")
        }
        currentUserId = user.id
        setUserId(currentUserId)
      }

      console.log("Using user ID:", currentUserId)

      // Генерируем requestId и логируем попытку (без списания)
      const requestId = crypto.randomUUID()
      void log("ai_requests", "attempt", {
        pagePath: "/app/ai-assistant",
        requestId,
        chars: messageToSend.length,
      })

      const weather = await getCurrentWeather()
      // Ensure weather always has required fields
      const safeWeather = {
        location: weather?.location || "Москва",
        temperature: weather?.temperature ?? 20,
        description: weather?.description || "ясно",
      }
      const envUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"
      const aiBaseUrl = envUrl.replace(/\/webhook\/?$/, "")
      const requestUrl = `${aiBaseUrl}/webhook-test/user-prompt-rec`
      const authToken = await getAuthToken()

      console.log("Sending request to AI API:", { url: requestUrl, userId: currentUserId, promptLength: messageToSend.length, weather: safeWeather })

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        body: JSON.stringify({ user_id: currentUserId, prompt: messageToSend, weather: safeWeather }),
      })

      console.log("AI API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        console.error("AI API error:", response.status, errorText)
        throw new Error(`AI API error: ${response.status}`)
      }

      const responseText = await response.text()
      console.log("AI API raw response:", responseText)

      let responseData: AIPromptResponse[]
      try {
        responseData = JSON.parse(responseText)
      } catch (parseError) {
        console.error("Failed to parse AI API response:", parseError, "Response text:", responseText)
        throw new Error("Invalid JSON response from AI API")
      }

      console.log("AI API parsed response:", responseData)

      if (!Array.isArray(responseData) || responseData.length === 0) {
        console.error("Invalid response format - not an array or empty:", responseData)
        throw new Error("Invalid response format from AI API")
      }

      const firstResponse = responseData[0]

      // Трекаем использование AI ассистента (только первый раз)
      void trackOnce("ai_assistant_used", { prompt_length: messageToSend.length })

      if ("type" in firstResponse && firstResponse.type === "trash") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Извините, но я не могу помочь с этим запросом. Попробуйте задать вопрос о стиле, моде или гардеробе! 👗✨",
          },
        ])
      } else if ("content" in firstResponse) {
        setMessages((prev) => [...prev, { role: "assistant", content: firstResponse.content }])
      } else if ("id" in firstResponse && "title" in firstResponse && "items" in firstResponse) {
        const outfitRecommendation: UserRecommendation = {
          id: firstResponse.id,
          title: firstResponse.title,
          description: firstResponse.description,
          items: firstResponse.items.map((item) => ({
            type: "clothing",
            id: Number.parseInt(item.id),
            name: item.name,
            image_url: item.image_url,
            color: item.color || "unknown",
          })),
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Отличный выбор! Вот образ "${firstResponse.title}":`,
            outfit: outfitRecommendation,
          },
        ])
      } else {
        throw new Error("Unknown response format from AI API")
      }

      // Списываем 1 ai_request ПОСЛЕ успешного ответа
      const bill = await consume("ai_requests", { pagePath: "/app/ai-assistant", requestId }, 1)
      if (!bill.ok && bill.code === "payment_required") setPaywallOpen(true)
    } catch (error) {
      console.error("Error in handleSend:", error)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Произошла ошибка при обработке вашего запроса. Попробуйте еще раз! 🔄",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveOutfit = async (outfit: UserRecommendation) => {
    try {
      // Создаем образ в user_looks
      const response = await api.post("/api/user-looks", {
        name: outfit.title,
        description: outfit.description,
        items: outfit.items.map(item => ({
          type: "user",
          id: item.id
        })),
      })

      toast({
        title: "Успешно!",
        description: `Образ "${outfit.title}" добавлен в вашу коллекцию`,
      })
    } catch (error) {
      console.error("Failed to save outfit:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить образ. Попробуйте еще раз.",
        variant: "destructive",
      })
    }
  }

  const handleQuickAction = (action: "photo" | "outfit") => {
    if (action === "photo") {
      setShowPhotoForm(true)
    } else if (action === "outfit") {
      handleSend("Подбери мне образ на сегодня с учетом погоды")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-full p-2">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">ИИ-Стилист</h1>
            <p className="text-sm text-gray-500">Подбор образов и анализ фото</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-56">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`flex space-x-3 max-w-3xl ${message.role === "user" ? "flex-row-reverse space-x-reverse" : ""}`}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback
                  className={message.role === "user" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}
                >
                  {message.role === "user" ? "Вы" : "ИИ"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Card className={message.role === "user" ? "bg-blue-500 text-white" : "bg-white"}>
                  <CardContent className="p-3">
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.outfit && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">{message.outfit.title}</h4>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveOutfit(message.outfit!)}
                            className="ml-2"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Сохранить
                          </Button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{message.outfit.description}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {message.outfit.items.map((item) => (
                            <div key={item.id} className="text-center">
                              <div className="aspect-square bg-gray-200 rounded-lg mb-2 overflow-hidden">
                                <img
                                  src={item.image_url || "/placeholder.svg"}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.src = "/placeholder.svg?height=150&width=150"
                                  }}
                                />
                              </div>
                              <p className="text-xs font-medium text-gray-900">{item.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex space-x-3 max-w-3xl">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-purple-500 text-white">ИИ</AvatarFallback>
              </Avatar>
              <Card className="bg-white">
                <CardContent className="p-3">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                    <p className="text-sm text-gray-600">Думаю над вашим запросом...</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 pb-24">
        <div className="max-w-7xl mx-auto">
          {/* Quick Actions - НАД инпутом */}
          <div className="px-4 pt-3 pb-2 flex flex-col sm:flex-row gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction("outfit")}
              disabled={isLoading}
              className="w-full sm:w-auto whitespace-nowrap justify-center"
            >
              <Sparkles className="h-3 w-3 mr-1.5" />
              Подобрать образ
            </Button>
          </div>

          {/* Input */}
          <div className="px-4 pb-4">
            <div className="flex space-x-3">
              <div className="flex-1">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Опишите ваш стиль или задайте вопрос..."
                  className="w-full"
                  disabled={isLoading}
                />
              </div>
              <Button onClick={() => handleSend()} disabled={isLoading || !inputValue.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Analysis Modal */}
      {showPhotoForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Анализ фото</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowPhotoForm(false)}>
                ✕
              </Button>
            </div>
            <PhotoAnalysisForm
              onSuccess={(result) => {
                setShowPhotoForm(false)
                setMessages((prev) => [
                  ...prev,
                  { role: "user", content: "Проанализируй это фото одежды" },
                  { role: "assistant", content: result }
                ])
              }}
            />
          </div>
        </div>
      )}

      {/* SubscriptionSheet */}
      <SubscriptionSheet
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => setPaywallOpen(false)}
      />
    </div>
  )
}
