"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, Cell, LabelList } from "recharts"
import { Users, TrendingUp, Target, Zap, CreditCard, Loader2, Sparkles, CheckCircle2, Download } from "lucide-react"
import * as XLSX from "xlsx"

interface AnalyticsData {
  onboarding: {
    users_with_first_item: number
    users_onboarding_complete: number
    users_wardrobe_30: number
    users_wardrobe_50: number
    users_wardrobe_100: number
  }
  ahaMoment: {
    users_first_outfit: number
    users_first_tryon: number
    users_clicked_recommendation: number
  }
  value: {
    total_outfits_saved: number
    users_saved_outfits: number
    total_outfits_shared: number
    total_tasks_completed: number
    repeat_task_rate: number
    outfits_per_active_user: number
  }
  engagement: {
    users_used_ai: number
    total_ai_sessions: number
  }
  retention: {
    d1_retention: number
    d7_retention: number
    d30_retention: number
    d1_users: number
    d7_users: number
    d30_users: number
  }
  monetization: {
    paywall_shown: number
    conversions_to_premium: number
    conversion_rate: number
    premium_users: number
    premium_feature_uses: number
  }
  funnel: Array<{
    stage: string
    users: number
  }>
  timeline: Array<{
    date: string
    first_item_added: number
    first_outfit_generated: number
    outfit_saved: number
    ai_assistant_used: number
  }>
}

const COLORS = {
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#8b5cf6",
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const result = await api.get("/api/admin/analytics")
      setData(result)
    } catch (error) {
      console.error("Failed to load analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = () => {
    if (!data) return

    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary metrics
    const summaryData = [
      ["Метрика", "Значение"],
      ["", ""],
      ["=== ОНБОРДИНГ ===", ""],
      ["Пользователей с первой вещью", data.onboarding.users_with_first_item],
      ["Завершили онбординг", data.onboarding.users_onboarding_complete],
      ["30% гардероба", data.onboarding.users_wardrobe_30],
      ["50% гардероба", data.onboarding.users_wardrobe_50],
      ["100% гардероба", data.onboarding.users_wardrobe_100],
      ["", ""],
      ["=== AHA-МОМЕНТ ===", ""],
      ["Первый образ", data.ahaMoment.users_first_outfit],
      ["Первая примерка", data.ahaMoment.users_first_tryon],
      ["Клики по рекомендациям", data.ahaMoment.users_clicked_recommendation],
      ["", ""],
      ["=== ДОСТАВКА ЦЕННОСТИ ===", ""],
      ["Всего образов сохранено", data.value.total_outfits_saved],
      ["Пользователей сохранявших образы", data.value.users_saved_outfits],
      ["Образов поделились", data.value.total_outfits_shared],
      ["Задач завершено", data.value.total_tasks_completed],
      ["Repeat Task Rate", `${data.value.repeat_task_rate}%`],
      ["Образов на пользователя", data.value.outfits_per_active_user],
      ["", ""],
      ["=== ВОВЛЕЧЁННОСТЬ ===", ""],
      ["Использовали AI", data.engagement.users_used_ai],
      ["AI сессий", data.engagement.total_ai_sessions],
      ["", ""],
      ["=== RETENTION ===", ""],
      ["D1 Retention", `${data.retention.d1_retention}%`],
      ["D7 Retention", `${data.retention.d7_retention}%`],
      ["D30 Retention", `${data.retention.d30_retention}%`],
      ["D1 пользователей", data.retention.d1_users],
      ["D7 пользователей", data.retention.d7_users],
      ["D30 пользователей", data.retention.d30_users],
      ["", ""],
      ["=== МОНЕТИЗАЦИЯ ===", ""],
      ["Paywall показан", data.monetization.paywall_shown],
      ["Конверсий в premium", data.monetization.conversions_to_premium],
      ["Конверсия", `${data.monetization.conversion_rate}%`],
      ["Premium пользователей", data.monetization.premium_users],
      ["Premium функций использовано", data.monetization.premium_feature_uses],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws1, "Сводка")

    // Sheet 2: Funnel
    const funnelData = [["Этап", "Пользователей"], ...data.funnel.map((item) => [item.stage, item.users])]
    const ws2 = XLSX.utils.aoa_to_sheet(funnelData)
    XLSX.utils.book_append_sheet(wb, ws2, "Воронка")

    // Sheet 3: Timeline
    const timelineData = [
      ["Дата", "Первая вещь", "Первый образ", "Образ сохранён", "AI использован"],
      ...data.timeline.map((item) => [
        item.date,
        item.first_item_added,
        item.first_outfit_generated,
        item.outfit_saved,
        item.ai_assistant_used,
      ]),
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(timelineData)
    XLSX.utils.book_append_sheet(wb, ws3, "Динамика")

    // Export
    const date = new Date().toISOString().split("T")[0]
    XLSX.writeFile(wb, `analytics_${date}.xlsx`)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-gray-500">Не удалось загрузить аналитику</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Аналитика продукта</h1>
          <p className="text-muted-foreground mt-2">Ключевые метрики и поведение пользователей</p>
        </div>
        <Button onClick={exportToExcel} className="gap-2">
          <Download className="h-4 w-4" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Onboarding Metrics */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-600" />
          Онбординг
        </h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Первая вещь</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.onboarding.users_with_first_item}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Завершили онбординг</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.onboarding.users_onboarding_complete}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">30% гардероба</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.onboarding.users_wardrobe_30}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">50% гардероба</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.onboarding.users_wardrobe_50}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">100% гардероба</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.onboarding.users_wardrobe_100}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Aha-Moment Metrics */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-600" />
          Aha-момент
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Первый образ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.ahaMoment.users_first_outfit}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Первая примерка</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.ahaMoment.users_first_tryon}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Клики по рекомендациям</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.ahaMoment.users_clicked_recommendation}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Value Delivery */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          Доставка ценности
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Образов сохранено</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.value.total_outfits_saved}</div>
              <p className="text-xs text-muted-foreground mt-1">Всего</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Сохраняли образы</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.value.users_saved_outfits}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Repeat Task Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.value.repeat_task_rate}%</div>
              <p className="text-xs text-muted-foreground mt-1">Возвращаются</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Образов на пользователя</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.value.outfits_per_active_user}</div>
              <p className="text-xs text-muted-foreground mt-1">В среднем</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Engagement & Retention */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Вовлечённость
          </h2>
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Использовали AI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.engagement.users_used_ai}</div>
                <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">AI сессий</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.engagement.total_ai_sessions}</div>
                <p className="text-xs text-muted-foreground mt-1">Всего</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Retention
          </h2>
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">D1 / D7 / D30</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div>
                    <div className="text-2xl font-bold">{data.retention.d1_retention}%</div>
                    <p className="text-xs text-muted-foreground">D1</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.retention.d7_retention}%</div>
                    <p className="text-xs text-muted-foreground">D7</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.retention.d30_retention}%</div>
                    <p className="text-xs text-muted-foreground">D30</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Вернувшихся пользователей</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">D1:</span>
                    <span className="font-medium">{data.retention.d1_users}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">D7:</span>
                    <span className="font-medium">{data.retention.d7_users}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">D30:</span>
                    <span className="font-medium">{data.retention.d30_users}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Monetization */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600" />
          Монетизация
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Paywall показан</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.monetization.paywall_shown}</div>
              <p className="text-xs text-muted-foreground mt-1">Раз</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Конверсия</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.monetization.conversion_rate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{data.monetization.conversions_to_premium} конверсий</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Premium пользователей</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.monetization.premium_users}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Premium фичи</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.monetization.premium_feature_uses}</div>
              <p className="text-xs text-muted-foreground mt-1">Использований</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Воронка конверсии</CardTitle>
          <CardDescription>От регистрации до повторного использования</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.funnel} layout="vertical">
              <XAxis type="number" />
              <YAxis dataKey="stage" type="category" width={150} />
              <Tooltip
                formatter={(value: number) => [`${value} пользователей`, "Количество"]}
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
              />
              <Bar dataKey="users" fill={COLORS.primary} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Timeline Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Первые вещи</CardTitle>
            <CardDescription>Пользователи добавившие первую вещь</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.timeline}>
                <defs>
                  <linearGradient id="colorFirstItem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString("ru")}
                  formatter={(value: number) => [`${value}`, "Событий"]}
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="first_item_added"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  fill="url(#colorFirstItem)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Создание образов</CardTitle>
            <CardDescription>Первые образы и сохранения</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.timeline}>
                <defs>
                  <linearGradient id="colorOutfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString("ru")}
                  formatter={(value: number) => [`${value}`, "Событий"]}
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="outfit_saved"
                  stroke={COLORS.success}
                  strokeWidth={2}
                  fill="url(#colorOutfit)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
