"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, RefreshCw } from "lucide-react"

interface ImageTestWidgetProps {
  imageUrl: string
  title?: string
}

export function ImageTestWidget({ imageUrl, title = "Тест изображения" }: ImageTestWidgetProps) {
  const [testResults, setTestResults] = useState<{
    direct: { success: boolean; time: number; error?: string }
    proxy: { success: boolean; time: number; error?: string }
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const runTest = async () => {
    setIsLoading(true)
    const results = {
      direct: { success: false, time: 0, error: "" },
      proxy: { success: false, time: 0, error: "" },
    }

    // Тест прямого доступа
    try {
      const startTime = Date.now()
      const response = await fetch(imageUrl, { method: "HEAD" })
      results.direct.time = Date.now() - startTime
      results.direct.success = response.ok
      if (!response.ok) {
        results.direct.error = `${response.status} ${response.statusText}`
      }
    } catch (error) {
      results.direct.error = error instanceof Error ? error.message : "Unknown error"
    }

    // Тест через прокси
    try {
      const startTime = Date.now()
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      const response = await fetch(proxyUrl, { method: "HEAD" })
      results.proxy.time = Date.now() - startTime
      results.proxy.success = response.ok
      if (!response.ok) {
        results.proxy.error = `${response.status} ${response.statusText}`
      }
    } catch (error) {
      results.proxy.error = error instanceof Error ? error.message : "Unknown error"
    }

    setTestResults(results)
    setIsLoading(false)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Button size="sm" variant="outline" onClick={runTest} disabled={isLoading}>
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Превью изображений */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Прямо</div>
            <img
              src={imageUrl || "/placeholder.svg"}
              alt="Direct"
              className="w-full h-16 object-cover rounded border"
              onError={(e) => {
                e.currentTarget.src = "/placeholder.svg?height=64&width=64&text=Failed"
              }}
            />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Прокси</div>
            <img
              src={`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`}
              alt="Proxy"
              className="w-full h-16 object-cover rounded border"
              onError={(e) => {
                e.currentTarget.src = "/placeholder.svg?height=64&width=64&text=Proxy+Failed"
              }}
            />
          </div>
        </div>

        {/* Результаты тестов */}
        {testResults && (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span>Прямой доступ:</span>
              <div className="flex items-center gap-1">
                {testResults.direct.success ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>{testResults.direct.time}ms</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span>Через прокси:</span>
              <div className="flex items-center gap-1">
                {testResults.proxy.success ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>{testResults.proxy.time}ms</span>
              </div>
            </div>
          </div>
        )}

        {/* Статус */}
        <div className="flex justify-center">
          {testResults ? (
            <Badge variant={testResults.proxy.success ? "default" : "destructive"}>
              {testResults.proxy.success ? "Прокси работает" : "Проблемы с прокси"}
            </Badge>
          ) : (
            <Badge variant="secondary">Нажмите для теста</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
