"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Activity, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface UsageStats {
  tokens_count: number
  feeds_count: number
  api_calls_today: number
  api_calls_total: number
  success_rate: number
  daily: Array<{
    date: string
    total: number
    success: number
    errors: number
    avg_latency: number
  }>
  error_breakdown: Record<string, number>
}

const ERROR_LABELS: Record<string, string> = {
  INVALID_PERSON_PHOTO: "Неверное фото человека",
  INVALID_CLOTHING_PHOTO: "Неверное фото одежды",
  RATE_LIMIT_EXCEEDED: "Превышен лимит",
  VTON_GENERATION_FAILED: "Ошибка генерации",
  INTERNAL_ERROR: "Внутренняя ошибка",
}

export default function PartnerStatsPage() {
  const { toast } = useToast()
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get<UsageStats>("/api/partner/usage")
        setStats(data)
      } catch {
        toast({ title: "Ошибка загрузки", variant: "destructive" })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Статистика
        </h1>
        <p className="text-gray-500 mt-1">Аналитика использования API за 30 дней</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard title="Сегодня" value={stats.api_calls_today} icon={Activity} />
        <SummaryCard title="Всего" value={stats.api_calls_total} icon={BarChart3} />
        <SummaryCard title="Успешных" value={`${stats.success_rate}%`} icon={CheckCircle2} iconColor="text-green-600" />
        <SummaryCard
          title="Ср. время (мс)"
          value={
            stats.daily.length > 0
              ? Math.round(stats.daily.reduce((s, d) => s + d.avg_latency, 0) / stats.daily.length)
              : 0
          }
          icon={Clock}
          iconColor="text-blue-600"
        />
      </div>

      {/* Daily chart (simple bar chart using divs) */}
      {stats.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Вызовы API по дням</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.daily.slice(-14).map((day) => {
                const maxTotal = Math.max(...stats.daily.map((d) => d.total), 1)
                const successPct = (day.success / maxTotal) * 100
                const errorPct = (day.errors / maxTotal) * 100
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 w-20 shrink-0">
                      {day.date.slice(5)} {/* MM-DD */}
                    </div>
                    <div className="flex-1 flex h-6 rounded-full overflow-hidden bg-gray-100">
                      {successPct > 0 && (
                        <div
                          className="bg-green-500 transition-all"
                          style={{ width: `${successPct}%` }}
                        />
                      )}
                      {errorPct > 0 && (
                        <div
                          className="bg-red-400 transition-all"
                          style={{ width: `${errorPct}%` }}
                        />
                      )}
                    </div>
                    <div className="text-xs text-gray-600 w-12 text-right shrink-0">
                      {day.total}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" /> Успешные
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-400" /> Ошибки
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error breakdown */}
      {Object.keys(stats.error_breakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Распределение ошибок
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.error_breakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([code, count]) => (
                  <div key={code} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {code}
                      </Badge>
                      <span className="text-sm text-gray-600">
                        {ERROR_LABELS[code] || code}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats.daily.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Пока нет данных</p>
            <p className="text-sm">Статистика появится после первых вызовов API</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-gray-600",
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
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
