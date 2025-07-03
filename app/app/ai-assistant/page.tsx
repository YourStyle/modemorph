"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Send, Mic, Camera, Sparkles } from "lucide-react"
import { AIAssistantLoader } from "@/components/ai-assistant-loader"

export default function AIAssistantPage() {
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])

  const handleSend = async () => {
    if (!message.trim()) return

    const userMessage = message
    setMessage("")
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])
    setIsLoading(true)

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Привет! Я ваш стилист-ассистент. Расскажите, какой образ вы хотите создать?",
        },
      ])
      setIsLoading(false)
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4">
        <div className="text-center">
          <h1 className="text-xl font-serif font-bold text-gray-900">ИИ-Ассистент</h1>
          <p className="text-sm text-gray-600">Ваш персональный стилист</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 px-4 py-6 overflow-y-auto">
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
              <Button variant="outline" className="justify-start bg-transparent">
                <Sparkles className="w-4 h-4 mr-2" />
                Подобрать образ на сегодня
              </Button>
              <Button variant="outline" className="justify-start bg-transparent">
                <Camera className="w-4 h-4 mr-2" />
                Проанализировать фото
              </Button>
              <Button variant="outline" className="justify-start bg-transparent">
                <Mic className="w-4 h-4 mr-2" />
                Дать совет по стилю
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <Card className={`max-w-xs ${msg.role === "user" ? "bg-gray-900 text-white" : "bg-white"}`}>
                  <CardContent className="p-3">
                    <p className="text-sm">{msg.content}</p>
                  </CardContent>
                </Card>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <Card className="bg-white">
                  <CardContent className="p-3">
                    <AIAssistantLoader size={24} />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="pb-10">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Спросите что-нибудь о стиле..."
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!message.trim() || isLoading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
