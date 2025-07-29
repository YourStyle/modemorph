"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RefreshCw, CheckCircle, XCircle, Clock, Wifi, WifiOff } from "lucide-react"

interface TestResult {
  originalUrl: string
  directAccess: {
    success: boolean
    error: string
    responseTime: number
  }
  proxyAccess: {
    success: boolean
    error: string
    responseTime: number
  }
}

interface TestResponse {
  timestamp: string
  testResults: TestResult[]
  summary: {
    totalTests: number
    directSuccessRate: number
    proxySuccessRate: number
    averageDirectResponseTime: number
    averageProxyResponseTime: number
  }
}

export default function TestProxyPage() {
  const [testData, setTestData] = useState<TestResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [manualTestUrl, setManualTestUrl] = useState("")
  const [manualTestResult, setManualTestResult] = useState<{
    direct: { success: boolean; time: number; error?: string }
    proxy: { success: boolean; time: number; error?: string }
  } | null>(null)

  const runAutomaticTests = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/proxy-image/test")
      const data = await response.json()
      setTestData(data)
    } catch (error) {
      console.error("Test failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const runManualTest = async () => {
    if (!manualTestUrl) return

    setIsLoading(true)
    const results = {
      direct: { success: false, time: 0, error: "" },
      proxy: { success: false, time: 0, error: "" },
    }

    // Тест прямого доступа
    try {
      const startTime = Date.now()
      const response = await fetch(manualTestUrl, { method: "HEAD" })
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
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(manualTestUrl)}`
      const response = await fetch(proxyUrl, { method: "HEAD" })
      results.proxy.time = Date.now() - startTime
      results.proxy.success = response.ok
      if (!response.ok) {
        results.proxy.error = `${response.status} ${response.statusText}`
      }
    } catch (error) {
      results.proxy.error = error instanceof Error ? error.message : "Unknown error"
    }

    setManualTestResult(results)
    setIsLoading(false)
  }

  useEffect(() => {
    runAutomaticTests()
  }, [])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Тест прокси изображений</h1>
          <p className="text-muted-foreground">Проверка доступности изображений через прямое подключение и прокси</p>
        </div>
        <Button onClick={runAutomaticTests} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Обновить тесты
        </Button>
      </div>

      {/* Сводка результатов */}
      {testData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Всего тестов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{testData.summary.totalTests}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Прямой доступ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(testData.summary.directSuccessRate * 100)}%</div>
              <p className="text-xs text-muted-foreground">
                ~{Math.round(testData.summary.averageDirectResponseTime)}ms
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Через прокси</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(testData.summary.proxySuccessRate * 100)}%</div>
              <p className="text-xs text-muted-foreground">
                ~{Math.round(testData.summary.averageProxyResponseTime)}ms
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Статус</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={testData.summary.proxySuccessRate > 0.8 ? "default" : "destructive"}>
                {testData.summary.proxySuccessRate > 0.8 ? "Работает" : "Проблемы"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Детальные результаты */}
      {testData && (
        <Card>
          <CardHeader>
            <CardTitle>Детальные результаты тестов</CardTitle>
            <CardDescription>Последнее обновление: {new Date(testData.timestamp).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testData.testResults.map((result, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="font-mono text-sm text-muted-foreground mb-3 break-all">{result.originalUrl}</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Прямой доступ */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4" />
                      <span className="font-medium">Прямой доступ</span>
                      {result.directAccess.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {result.directAccess.responseTime}ms
                    </div>
                    {result.directAccess.error && (
                      <div className="text-sm text-red-500 font-mono">{result.directAccess.error}</div>
                    )}
                  </div>

                  {/* Доступ через прокси */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <WifiOff className="w-4 h-4" />
                      <span className="font-medium">Через прокси</span>
                      {result.proxyAccess.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {result.proxyAccess.responseTime}ms
                    </div>
                    {result.proxyAccess.error && (
                      <div className="text-sm text-red-500 font-mono">{result.proxyAccess.error}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Ручной тест */}
      <Card>
        <CardHeader>
          <CardTitle>Ручной тест изображения</CardTitle>
          <CardDescription>Введите URL изображения для проверки доступности</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://bgkosez9szawb1ks.public.blob.vercel-storage.com/your-image.jpg"
              value={manualTestUrl}
              onChange={(e) => setManualTestUrl(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={runManualTest} disabled={isLoading || !manualTestUrl}>
              Тестировать
            </Button>
          </div>

          {manualTestResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wifi className="w-4 h-4" />
                  <span className="font-medium">Прямой доступ</span>
                  {manualTestResult.direct.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="text-sm text-muted-foreground">Время: {manualTestResult.direct.time}ms</div>
                {manualTestResult.direct.error && (
                  <div className="text-sm text-red-500 mt-1">{manualTestResult.direct.error}</div>
                )}
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <WifiOff className="w-4 h-4" />
                  <span className="font-medium">Через прокси</span>
                  {manualTestResult.proxy.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="text-sm text-muted-foreground">Время: {manualTestResult.proxy.time}ms</div>
                {manualTestResult.proxy.error && (
                  <div className="text-sm text-red-500 mt-1">{manualTestResult.proxy.error}</div>
                )}
              </div>
            </div>
          )}

          {/* Предварительный просмотр изображений */}
          {manualTestUrl && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Прямое изображение</h4>
                <img
                  src={manualTestUrl || "/placeholder.svg"}
                  alt="Direct access test"
                  className="w-full h-32 object-cover rounded border"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg?height=128&width=200&text=Failed+to+load"
                  }}
                />
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Через прокси</h4>
                <img
                  src={`/api/proxy-image?url=${encodeURIComponent(manualTestUrl)}`}
                  alt="Proxy access test"
                  className="w-full h-32 object-cover rounded border"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg?height=128&width=200&text=Proxy+failed"
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
