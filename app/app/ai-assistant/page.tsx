"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Camera, Sparkles, Image as ImageIcon, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { sessionAuth } from "@/lib/tma/session-auth"
import { PhotoAnalysisForm } from "@/components/photo-analysis-form"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import { useFeature } from "@/hooks/use-feature"
import { api } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useAnalytics } from "@/hooks/use-analytics"
import { getUserCoords } from "@/lib/tma/geo"

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
    // Получаем ID пользователя из session storage
    const uid = sessionAuth.getUserId()
    if (uid) setUserId(uid)
  }, [])

  useEffect(() => {
    // Автоскролл к последнему сообщению
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const getCurrentWeather = async () => {
    const fallback = { temperature: 20, condition: "Clear", description: "ясно", location: "Москва" }

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
      } catch {
        // Continue to geolocation if cached weather fails
      }

      // TMA-aware геолокация: Telegram LocationManager → браузер → Москва.
      const coords = (await getUserCoords(8000)) || { latitude: 55.7558, longitude: 37.6176 }

      try {
        const weatherData = await api.get(`/api/weather?lat=${coords.latitude}&lon=${coords.longitude}`)
        return {
          temperature: weatherData.temperature,
          condition: weatherData.condition,
          description: weatherData.description,
          location: weatherData.location,
        }
      } catch {
        return fallback
      }
    } catch (error) {
      console.error("Error getting weather:", error)
      return fallback
    }
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
        currentUserId = sessionAuth.getUserId()
        if (!currentUserId) {
          throw new Error("User not authenticated")
        }
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
      const safeWeather = {
        location: weather?.location || "Москва",
        temperature: weather?.temperature ?? 20,
        description: weather?.description || "ясно",
      }

      console.log("Sending request to /api/ai-assistant:", { promptLength: messageToSend.length, weather: safeWeather })

      // Use api.post — it auto-adds Bearer token and retries on 401 (token refresh)
      const responseData: AIPromptResponse[] = await api.post("/api/ai-assistant", {
        prompt: messageToSend,
        weather: safeWeather,
      })

      console.log("AI API parsed response:", responseData)

      // api.post returns parsed JSON; handle non-array or error shapes
      if (!Array.isArray(responseData) || responseData.length === 0) {
        const errMsg = (responseData as any)?.error
        if (errMsg) {
          console.error("AI API returned error:", errMsg)
          throw new Error(errMsg)
        }
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
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="rounded-xl p-2 shadow-sm" style={{ background: "linear-gradient(135deg, #EC9DE2, #89AEFF)" }}>
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">ИИ-Стилист</h1>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-56">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} fade-in`}>
            <div
              className={`flex space-x-2.5 max-w-[85%] ${message.role === "user" ? "flex-row-reverse space-x-reverse" : ""}`}
            >
              <Avatar className="h-7 w-7 flex-shrink-0 shadow-sm">
                <AvatarFallback
                  className={message.role === "user" ? "bg-gray-900 text-white text-xs" : "text-white text-xs"}
                  style={message.role !== "user" ? { background: "linear-gradient(135deg, #EC9DE2, #89AEFF)" } : undefined}
                >
                  {message.role === "user" ? "Вы" : "ИИ"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Card className={message.role === "user" ? "bg-gray-900 text-white shadow-sm" : "bg-white shadow-sm"}>
                  <CardContent className="p-3.5">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    {message.outfit && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900 text-sm">{message.outfit.title}</h4>
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
                        <p className="text-xs text-gray-500 mb-3">{message.outfit.description}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {message.outfit.items.map((item) => (
                            <div key={item.id} className="text-center">
                              <div className="aspect-square bg-white rounded-xl mb-2 overflow-hidden shadow-sm">
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
          <div className="flex justify-start fade-in">
            <div className="flex space-x-2.5 max-w-[85%]">
              <Avatar className="h-7 w-7 flex-shrink-0 shadow-sm">
                <AvatarFallback className="text-white text-xs" style={{ background: "linear-gradient(135deg, #EC9DE2, #89AEFF)" }}>ИИ</AvatarFallback>
              </Avatar>
              <Card className="bg-white shadow-sm">
                <CardContent className="p-3.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="text-sm text-muted-foreground">Думаю...</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="fixed inset-x-0 bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/50 pb-24">
        <div className="max-w-7xl mx-auto">
          {/* Quick Actions */}
          <div className="px-4 pt-3 pb-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction("outfit")}
              disabled={isLoading}
              className="whitespace-nowrap border-border/50 text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="h-3 w-3 mr-1.5" />
              Подобрать образ
            </Button>
          </div>

          {/* Input */}
          <div className="px-4 pb-4">
            <div className="flex space-x-2.5">
              <div className="flex-1">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Опишите ваш стиль или задайте вопрос..."
                  className="w-full bg-secondary/50 border-border/50"
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={() => handleSend()}
                disabled={isLoading || !inputValue.trim()}
                size="icon"
                className="rounded-xl shadow-sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Analysis Modal */}
      {showPhotoForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold tracking-tight">Анализ фото</h3>
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
