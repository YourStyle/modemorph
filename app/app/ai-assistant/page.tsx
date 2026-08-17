"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Camera, Sparkles, Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
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
    // fixed на весь вьюпорт (как экран «Идеи»): экран — самостоятельный чат,
    // не часть скролла страницы. Без этого общая закреплённая шапка (дата/погода)
    // из layout-client добавляет высоту сверх 100dvh, документ скроллится, и
    // автоскролл к последнему сообщению при монтировании уносит нашу шапку
    // чата за пределы экрана — «прыжок» ровно того, что запрещено ТЗ.
    <div className="fixed inset-0 z-[45] flex flex-col overflow-hidden bg-canvas">
      {/* Header — стеклянная закреплённая шапка (LIQUID_GLASS.md), без градиента:
          нейтральный значок, единственный акцент экрана зарезервирован под кнопку отправки */}
      <div
        className="glass relative z-10 border-b border-line px-4 pb-3"
        style={{ paddingTop: "calc(var(--tg-safe-top) + 0.75rem)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink">
            <Sparkles className="h-4 w-4 text-canvas" />
          </div>
          <h1 className="text-h1 text-ink">ИИ-Стилист</h1>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-56">
        {messages.map((message, index) => {
          const isUser = message.role === "user"
          return (
            <div
              key={index}
              className={cn("flex animate-fade-up", isUser ? "justify-end" : "justify-start")}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              <div className={cn("flex max-w-[85%] gap-2.5", isUser && "flex-row-reverse")}>
                <Avatar className="h-7 w-7 flex-shrink-0">
                  <AvatarFallback
                    className={cn(
                      "text-[11px] font-semibold",
                      isUser ? "bg-canvas-sunk text-ink ring-1 ring-inset ring-line" : "bg-ink text-canvas",
                    )}
                  >
                    {isUser ? "Вы" : "ИИ"}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3",
                    isUser ? "bg-ink text-canvas" : "bg-canvas-sunk text-ink",
                  )}
                >
                  <p className="text-body whitespace-pre-wrap">{message.content}</p>
                  {message.outfit && (
                    <div className="mt-3 border-t border-line/60 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-caption font-semibold text-ink">{message.outfit.title}</h4>
                        <button
                          onClick={() => handleSaveOutfit(message.outfit!)}
                          className="flex shrink-0 items-center gap-1 text-caption font-semibold text-signal transition-transform duration-press active:scale-95"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Сохранить
                        </button>
                      </div>
                      <p className="mb-3 text-caption text-ink-2">{message.outfit.description}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {message.outfit.items.map((item) => (
                          <div key={item.id} className="text-center">
                            <div className="mb-1 aspect-square overflow-hidden rounded-xl bg-canvas">
                              <img
                                src={item.image_url || "/placeholder.svg"}
                                alt={item.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.src = "/placeholder.svg?height=150&width=150"
                                }}
                              />
                            </div>
                            <p className="truncate text-[11px] text-ink-2">{item.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div className="flex justify-start animate-fade-up" role="status" aria-live="polite">
            <div className="flex max-w-[85%] gap-2.5">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-ink text-canvas text-[11px] font-semibold">ИИ</AvatarFallback>
              </Avatar>
              <div className="rounded-2xl bg-canvas-sunk px-4 py-3">
                <span className="sr-only">Ассистент печатает ответ</span>
                <div className="flex w-36 flex-col gap-2">
                  <div className="skeleton h-2.5 w-full rounded-full" />
                  <div className="skeleton h-2.5 w-2/3 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area — закреплённая внизу, стеклянный хром; safe-area учтена в pb,
          позиция fixed не зависит от скролла страницы, поэтому не «прыгает» при
          появлении клавиатуры */}
      <div className="glass fixed inset-x-0 bottom-0 z-10 border-t border-line pb-24">
        <div className="max-w-7xl mx-auto">
          {/* Quick Actions */}
          <div className="flex gap-2 px-4 pt-3 pb-2">
            <button
              onClick={() => handleQuickAction("outfit")}
              disabled={isLoading}
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3.5 py-2 text-caption font-medium text-ink-2 transition-transform duration-press active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-ink-3" />
              Подобрать образ
            </button>
            <button
              onClick={() => handleQuickAction("photo")}
              disabled={isLoading}
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3.5 py-2 text-caption font-medium text-ink-2 transition-transform duration-press active:scale-95 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 text-ink-3" />
              Фото на анализ
            </button>
          </div>

          {/* Input */}
          <div className="px-4 pb-4">
            <div className="flex gap-2.5">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Опишите ваш стиль или задайте вопрос..."
                className="flex-1 rounded-full border-line bg-canvas-sunk text-ink placeholder:text-ink-3"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !inputValue.trim()}
                aria-label="Отправить"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-signal text-signal-ink transition-transform duration-press active:scale-95 disabled:bg-canvas-sunk disabled:text-ink-3"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Analysis Modal */}
      {showPhotoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-canvas p-6 animate-scale-in">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-h2 text-ink">Анализ фото</h3>
              <button
                onClick={() => setShowPhotoForm(false)}
                aria-label="Закрыть"
                className="rounded-full p-1.5 text-ink-2 transition-colors hover:bg-canvas-sunk hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
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
