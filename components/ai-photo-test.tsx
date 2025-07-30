"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Camera, CheckCircle, XCircle } from "lucide-react"

export function AIPhotoTest() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState("https://storage.yandexcloud.net/modemorphs3/test-image.jpg")
  const [userId, setUserId] = useState("")

  const testWebhook = async () => {
    if (!imageUrl || !userId) {
      setError("Пожалуйста, заполните все поля")
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      console.log("🚀 Testing AI Photo Parse webhook...")

      const response = await fetch("/api/webhook/ai-photo-parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
          userId,
          analysisType: "wardrobe",
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      console.log("✅ Webhook test successful:", data)
      setResult(data)
    } catch (err) {
      console.error("❌ Webhook test failed:", err)
      setError(err instanceof Error ? err.message : "Неизвестная ошибка")
    } finally {
      setIsLoading(false)
    }
  }

  const checkStatus = async () => {
    try {
      const response = await fetch("/api/webhook/ai-photo-parse/status")
      const data = await response.json()
      console.log("📊 Webhook status:", data)
      setResult({ status: data })
    } catch (err) {
      console.error("❌ Status check failed:", err)
      setError("Не удалось проверить статус")
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Тест AI Photo Parse Webhook
        </CardTitle>
        <CardDescription>Тестирование webhook для анализа фотографий одежды</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="imageUrl">URL изображения</Label>
          <Input
            id="imageUrl"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://storage.yandexcloud.net/modemorphs3/..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="userId">ID пользователя</Label>
          <Input
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="UUID пользователя"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={testWebhook} disabled={isLoading} className="flex-1">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Анализ...
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                Тест анализа
              </>
            )}
          </Button>

          <Button onClick={checkStatus} variant="outline">
            Статус
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-green-700">Тест выполнен успешно</span>
            </div>

            <div className="space-y-2">
              <Label>Результат:</Label>
              <Textarea value={JSON.stringify(result, null, 2)} readOnly className="font-mono text-sm" rows={10} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
