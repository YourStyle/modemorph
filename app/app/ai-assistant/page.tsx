"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Camera, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { PhotoAnalysisForm } from "@/components/photo-analysis-form"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { PaywallModal } from "@/components/paywall-modal"
import { useFeature } from "@/hooks/use-feature"

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

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Привет! Я ваш персональный стилист-ассистент. Расскажите мне о своих предпочтениях в стиле, планах на день или загрузите фото одежды для анализа! 👗✨",
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const { log, consume } = useFeature()

  useReconcileLimits(true)

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
      const cachedResponse = await fetch("/api/weather/cached")
      if (cachedResponse.ok) {
        const cachedWeather = await cachedResponse.json()
        return {
          temperature: cachedWeather.temperature,
          condition: cachedWeather.condition,
          description: cachedWeather.description,
          location: cachedWeather.location,
        }
      }

      // Если кэша нет, получаем текущую геолокацию
      return new Promise((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords
              try {
                const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)
                if (response.ok) {
                  const weatherData = await response.json()
                  resolve({
                    temperature: weatherData.temperature,
                    condition: weatherData.condition,
                    description: weatherData.description,
                    location: weatherData.location,
                  })
                } else {
                  resolve({
                    temperature: 20,
                    condition: "Clear",
                    description: "ясно",
                    location: "Москва",
                  })
                }
              } catch (error) {
                console.error("Error fetching weather:", error)
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
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = inputValue.trim()

    if (userMessage.length < 20) {
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

    if (userMessage.length > 2000) {
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

    // Генерируем requestId и логируем попытку (без списания)
    const requestId = crypto.randomUUID() // ⬅️ добавлено
    void log("ai_requests", "attempt", {
      pagePath: "/app/ai-assistant",
      requestId,
      chars: userMessage.length,
    }) // ⬅️ добавлено

    setMessages((prev) => [...prev, { role: "user", content: userMessage }])
    setInputValue("")
    setIsLoading(true)

    try {
      if (!userId) throw new Error("User ID not available")

      const weather = await getCurrentWeather()
      const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app"
      const requestUrl = `${aiApiUrl}/user-prompt-rec`
      const authToken = await getAuthToken()

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        body: JSON.stringify({ user_id: userId, prompt: userMessage, weather }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        console.error("AI API error:", response.status, errorText)
        throw new Error(`AI API error: ${response.status}`)
      }

      const responseData: AIPromptResponse[] = await response.json()
      if (!Array.isArray(responseData) || responseData.length === 0) {
        throw new Error("Invalid response format from AI API")
      }

      const firstResponse = responseData[0]

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

      // ⬇️ списываем 1 ai_request ПОСЛЕ успешного ответа
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-full p-2">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">ИИ-Стилист</h1>
            <p className="text-sm text-gray-500">Ваш персональный помощник по стилю</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        <h4 className="font-semibold text-gray-900 mb-2">{message.outfit.title}</h4>
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
      <div className="bg-white border-t border-gray-200 pt-4 px-4 pb-20">
        <div className="flex space-x-3">
          <div className="flex-1">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Опишите ваш стиль или задайте вопрос о моде..."
              className="w-full"
              disabled={isLoading}
            />
          </div>
          <Button onClick={handleSend} disabled={isLoading || !inputValue.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Actions */}

      </div>

      {/* PaywallModal */}
      <PaywallModal
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => setPaywallOpen(false)}
      />
    </div>
  )
}
