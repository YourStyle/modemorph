"use client"

import { useEffect, useState, useRef } from "react"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Key, FileUp, BarChart3, ArrowRight, Activity, CheckCircle2,
  Upload, Play, Loader2, Copy, Check, ImageIcon, AlertCircle,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"

interface DashboardStats {
  tokens_count: number
  feeds_count: number
  api_calls_today: number
  api_calls_total: number
  success_rate: number
}

interface PlaygroundResult {
  success: boolean
  result?: { image_url: string }
  error?: { code: string; message: string }
}

export default function PartnerDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Playground state
  const [personPhoto, setPersonPhoto] = useState<File | null>(null)
  const [clothingPhoto, setClothingPhoto] = useState<File | null>(null)
  const [personPreview, setPersonPreview] = useState<string | null>(null)
  const [clothingPreview, setClothingPreview] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [playgroundResult, setPlaygroundResult] = useState<PlaygroundResult | null>(null)
  const [playgroundLoading, setPlaygroundLoading] = useState(false)
  const [playgroundError, setPlaygroundError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const personRef = useRef<HTMLInputElement>(null)
  const clothingRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await api.get<DashboardStats>("/api/partner/usage?summary=true")
        setStats(data)
      } catch (error) {
        console.error("[PartnerDashboard] Failed to load stats:", error)
        setStats({ tokens_count: 0, feeds_count: 0, api_calls_today: 0, api_calls_total: 0, success_rate: 0 })
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [])

  const handleFileSelect = (file: File | null, type: "person" | "clothing") => {
    if (!file) return
    const url = URL.createObjectURL(file)
    if (type === "person") {
      setPersonPhoto(file)
      setPersonPreview(url)
    } else {
      setClothingPhoto(file)
      setClothingPreview(url)
    }
  }

  const runPlayground = async () => {
    if (!personPhoto || !clothingPhoto || !apiKey.trim()) return

    setPlaygroundLoading(true)
    setPlaygroundResult(null)
    setPlaygroundError(null)

    try {
      const formData = new FormData()
      formData.append("person_photo", personPhoto)
      formData.append("clothing_photo", clothingPhoto)

      const response = await fetch("/api/v1/vton", {
        method: "POST",
        headers: { "X-API-Key": apiKey.trim() },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setPlaygroundResult(null)
        setPlaygroundError(
          data?.detail?.message || data?.detail || data?.error?.message || `Ошибка ${response.status}`
        )
      } else {
        setPlaygroundResult(data)
      }
    } catch (err: any) {
      setPlaygroundError(err.message || "Ошибка соединения")
    } finally {
      setPlaygroundLoading(false)
    }
  }

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const PYTHON_EXAMPLE = `import requests

API_KEY = "mm_pk_your_token_here"
API_URL = "https://modemorph.ru/api/v1/vton"

def virtual_tryon(person_path: str, clothing_path: str) -> dict:
    """Виртуальная примерка — отправляет два фото, получает результат."""
    with open(person_path, "rb") as person, open(clothing_path, "rb") as clothing:
        response = requests.post(
            API_URL,
            headers={"X-API-Key": API_KEY},
            files={
                "person_photo": ("person.jpg", person, "image/jpeg"),
                "clothing_photo": ("clothing.jpg", clothing, "image/jpeg"),
            },
            timeout=120,  # генерация может занять до 2 минут
        )

    data = response.json()

    if response.status_code == 200 and data.get("success"):
        print(f"Результат: {data['result']['image_url']}")
        return data

    # Обработка ошибок
    error = data.get("detail", {})
    code = error.get("code", "UNKNOWN")
    message = error.get("message", str(data))

    if response.status_code == 429:
        print(f"Rate limit: {message}")
    elif response.status_code == 400:
        print(f"Ошибка валидации ({code}): {message}")
    elif response.status_code == 502:
        print(f"Ошибка генерации: {message}")
    else:
        print(f"Ошибка {response.status_code}: {message}")

    return data

# Пример использования
result = virtual_tryon("photo_person.jpg", "photo_clothing.jpg")`

  const CURL_EXAMPLE = `curl -X POST https://modemorph.ru/api/v1/vton \\
  -H "X-API-Key: mm_pk_your_token" \\
  -F "person_photo=@person.jpg" \\
  -F "clothing_photo=@clothing.jpg"`

  const ERROR_CODES = [
    { code: "400", name: "MISSING_PERSON_PHOTO", desc: "Не передано поле person_photo" },
    { code: "400", name: "MISSING_CLOTHING_PHOTO", desc: "Не передано поле clothing_photo" },
    { code: "400", name: "INVALID_PERSON_PHOTO", desc: "Фото человека не прошло AI-валидацию" },
    { code: "400", name: "INVALID_CLOTHING_PHOTO", desc: "Фото одежды не прошло AI-валидацию" },
    { code: "429", name: "RATE_LIMIT_EXCEEDED", desc: "Превышен лимит запросов в минуту" },
    { code: "502", name: "VTON_GENERATION_FAILED", desc: "AI не смог сгенерировать результат" },
    { code: "503", name: "OPENROUTER_API_KEY", desc: "AI-сервис временно недоступен" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="text-gray-500 mt-1">Обзор вашей партнёрской активности</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard title="API сегодня" value={isLoading ? "..." : String(stats?.api_calls_today ?? 0)} icon={Activity} />
        <StatsCard title="Всего вызовов" value={isLoading ? "..." : String(stats?.api_calls_total ?? 0)} icon={BarChart3} />
        <StatsCard title="Успешных" value={isLoading ? "..." : `${stats?.success_rate ?? 0}%`} icon={CheckCircle2} iconColor="text-green-600" />
        <StatsCard title="Токенов" value={isLoading ? "..." : String(stats?.tokens_count ?? 0)} icon={Key} iconColor="text-blue-600" />
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <QuickAction href="/partner/tokens" icon={Key} title="API токены" description="Управление токенами и лимитами" />
        <QuickAction href="/partner/feeds" icon={FileUp} title="XML фиды" description="Каталог товаров для рекомендаций" />
        <QuickAction href="/partner/stats" icon={BarChart3} title="Статистика" description="Детальная аналитика за 30 дней" />
      </div>

      {/* API Playground */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            API Playground
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Key input */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">API ключ</label>
            <input
              type="text"
              placeholder="mm_pk_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Photo uploads */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Фото человека</label>
              <input ref={personRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null, "person")} />
              <div
                onClick={() => personRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors aspect-[3/4] flex items-center justify-center overflow-hidden"
              >
                {personPreview ? (
                  <img src={personPreview} alt="Person" className="max-h-full max-w-full object-contain rounded" />
                ) : (
                  <div className="text-gray-400">
                    <Upload className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-xs">Загрузить фото</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Фото одежды</label>
              <input ref={clothingRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null, "clothing")} />
              <div
                onClick={() => clothingRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors aspect-[3/4] flex items-center justify-center overflow-hidden"
              >
                {clothingPreview ? (
                  <img src={clothingPreview} alt="Clothing" className="max-h-full max-w-full object-contain rounded" />
                ) : (
                  <div className="text-gray-400">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-xs">Загрузить фото</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Run button */}
          <Button
            onClick={runPlayground}
            disabled={playgroundLoading || !personPhoto || !clothingPhoto || !apiKey.trim()}
            className="w-full"
          >
            {playgroundLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Генерация (до 2 мин)...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Запустить примерку</>
            )}
          </Button>

          {/* Result */}
          {playgroundResult?.success && playgroundResult.result?.image_url && (
            <div className="border rounded-lg p-4 bg-green-50">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Успешно</span>
              </div>
              <img
                src={playgroundResult.result.image_url}
                alt="VTON result"
                className="rounded-lg max-h-96 mx-auto"
              />
              <pre className="mt-3 bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto">
                {JSON.stringify(playgroundResult, null, 2)}
              </pre>
            </div>
          )}

          {playgroundError && (
            <div className="border rounded-lg p-4 bg-red-50">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">Ошибка</span>
              </div>
              <pre className="bg-gray-900 text-red-300 rounded-lg p-3 text-xs overflow-x-auto">
                {playgroundError}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Интеграция</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="python">
            <TabsList>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="errors">Коды ошибок</TabsTrigger>
            </TabsList>

            <TabsContent value="python" className="mt-4">
              <div className="relative">
                <Button
                  variant="ghost" size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => copyCode(PYTHON_EXAMPLE)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-sm font-mono overflow-x-auto max-h-[500px]">
                  {PYTHON_EXAMPLE}
                </pre>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                Установите библиотеку: <code className="bg-gray-100 px-1 rounded">pip install requests</code>
              </p>
            </TabsContent>

            <TabsContent value="curl" className="mt-4">
              <div className="relative">
                <Button
                  variant="ghost" size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => copyCode(CURL_EXAMPLE)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-sm font-mono overflow-x-auto">
                  {CURL_EXAMPLE}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="errors" className="mt-4">
              <div className="space-y-2">
                {ERROR_CODES.map((err) => (
                  <div key={err.name} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">{err.code}</Badge>
                    <div>
                      <code className="text-xs font-mono text-red-600">{err.name}</code>
                      <p className="text-sm text-gray-600">{err.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function StatsCard({ title, value, icon: Icon, iconColor = "text-gray-600" }: {
  title: string; value: string; icon: React.ComponentType<{ className?: string }>; iconColor?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Icon className={`h-5 w-5 ${iconColor} mb-2`} />
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{title}</div>
      </CardContent>
    </Card>
  )
}

function QuickAction({ href, icon: Icon, title, description }: {
  href: string; icon: React.ComponentType<{ className?: string }>; title: string; description: string
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="pt-6">
          <Icon className="h-8 w-8 text-blue-600 mb-3" />
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
          <div className="flex items-center text-blue-600 text-sm font-medium mt-3">
            Перейти <ArrowRight className="h-4 w-4 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
