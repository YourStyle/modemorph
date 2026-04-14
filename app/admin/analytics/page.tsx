"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, Cell, LabelList } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, TrendingUp, Target, Zap, CreditCard, Loader2, Sparkles, CheckCircle2, Download, DollarSign } from "lucide-react"
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
  revenue: {
    mrr: number
    total_revenue: number
    arpu: number
    arppu: number
    ltv: number
    paying_users: number
    churn_rate: number
    avg_lifetime_months: number
  }
  stickiness: {
    dau: number
    mau: number
    ratio: number
    avg_days_active: number
  }
  cohortRetention: Array<{
    week: string
    cohort_size: number
    week_1: number
    week_2: number
    week_3: number
    week_4: number
    week_1_pct: number
    week_2_pct: number
    week_3_pct: number
    week_4_pct: number
  }>
  activation: Array<{
    action: string
    did_total: number
    did_retained: number
    did_retention_pct: number
    didnt_total: number
    didnt_retained: number
    didnt_retention_pct: number
  }>
  timeToValue: {
    avg_to_first_item_hours: number
    avg_to_first_outfit_hours: number
    median_to_first_item_hours: number
  }
}

interface PayingUser {
  profile_id: number
  user_id: string
  email: string
  full_name: string
  telegram_username: string
  telegram_id: string
  registered_at: string
  subscription_type: string | null
  sub_status: string | null
  sub_expires: string
  payments: Array<{
    amount: number
    action: string
    type: string
    date: string
  }>
}

const COLORS = {
  primary: "#EC9DE2",
  success: "#89AEFF",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#B97DC6",
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [payingUsers, setPayingUsers] = useState<PayingUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
    fetchPayingUsers()
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

  const fetchPayingUsers = async () => {
    try {
      const result = await api.get("/api/admin/paying-users")
      setPayingUsers(result.paying_users || [])
    } catch (error) {
      console.error("Failed to load paying users:", error)
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
      ["", ""],
      ["=== ЮНИТ-ЭКОНОМИКА ===", ""],
      ["MRR", `${data.revenue.mrr} ₽`],
      ["Общая выручка", `${data.revenue.total_revenue} ₽`],
      ["ARPU", `${data.revenue.arpu} ₽`],
      ["ARPPU", `${data.revenue.arppu} ₽`],
      ["LTV", `${data.revenue.ltv} ₽`],
      ["Платящих пользователей", data.revenue.paying_users],
      ["Churn Rate", `${data.revenue.churn_rate}%`],
      ["Ср. время подписки", `${data.revenue.avg_lifetime_months} мес.`],
      ["", ""],
      ["=== STICKINESS ===", ""],
      ["DAU", data.stickiness.dau],
      ["MAU", data.stickiness.mau],
      ["DAU/MAU", `${data.stickiness.ratio}%`],
      ["Ср. дней активности / 30 дней", data.stickiness.avg_days_active],
      ["", ""],
      ["=== TIME TO VALUE ===", ""],
      ["Среднее до первой вещи", `${data.timeToValue.avg_to_first_item_hours} ч`],
      ["Медиана до первой вещи", `${data.timeToValue.median_to_first_item_hours} ч`],
      ["Среднее до первого образа", `${data.timeToValue.avg_to_first_outfit_hours} ч`],
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

    // Sheet 4: Cohort Retention
    if (data.cohortRetention?.length) {
      const cohortData = [
        ["Неделя", "Когорта", "W1 %", "W1", "W2 %", "W2", "W3 %", "W3", "W4 %", "W4"],
        ...data.cohortRetention.map((c) => [
          c.week, c.cohort_size,
          c.week_1_pct, c.week_1, c.week_2_pct, c.week_2, c.week_3_pct, c.week_3, c.week_4_pct, c.week_4,
        ]),
      ]
      const ws4 = XLSX.utils.aoa_to_sheet(cohortData)
      XLSX.utils.book_append_sheet(wb, ws4, "Когорты")
    }

    // Sheet 5: Activation
    if (data.activation?.length) {
      const activationData = [
        ["Действие", "Сделали", "D7 retention %", "Не сделали", "D7 retention %", "Разница pp"],
        ...data.activation.map((a) => [
          a.action, a.did_total, a.did_retention_pct,
          a.didnt_total, a.didnt_retention_pct,
          +(a.did_retention_pct - a.didnt_retention_pct).toFixed(1),
        ]),
      ]
      const ws5 = XLSX.utils.aoa_to_sheet(activationData)
      XLSX.utils.book_append_sheet(wb, ws5, "Activation")
    }

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
          <h1 className="text-3xl font-bold tracking-tight">Аналитика продукта</h1>
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
          <Target className="h-5 w-5 text-[#B97DC6]" />
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
          <Zap className="h-5 w-5 text-amber-500" />
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
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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
            <Sparkles className="h-5 w-5 text-[#EC9DE2]" />
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
            <TrendingUp className="h-5 w-5 text-[#89AEFF]" />
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
          <CreditCard className="h-5 w-5 text-amber-500" />
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

      {/* Revenue / Unit Economics */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          Юнит-экономика
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">MRR</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.mrr.toLocaleString("ru")} &#8381;</div>
              <p className="text-xs text-muted-foreground mt-1">Monthly Recurring Revenue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">ARPU</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.arpu.toLocaleString("ru")} &#8381;</div>
              <p className="text-xs text-muted-foreground mt-1">Выручка / все пользователи</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">ARPPU</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.arppu.toLocaleString("ru")} &#8381;</div>
              <p className="text-xs text-muted-foreground mt-1">Выручка / платящие ({data.revenue.paying_users})</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">LTV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.ltv.toLocaleString("ru")} &#8381;</div>
              <p className="text-xs text-muted-foreground mt-1">
                ARPPU x {data.revenue.avg_lifetime_months} мес.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Общая выручка</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.total_revenue.toLocaleString("ru")} &#8381;</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.churn_rate}%</div>
              <p className="text-xs text-muted-foreground mt-1">Отток за 30 дней</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ср. время подписки</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.revenue.avg_lifetime_months} мес.</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stickiness + Time to Value */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Stickiness (DAU/MAU)
          </h2>
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">DAU / MAU</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{data.stickiness.ratio}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.stickiness.dau} DAU / {data.stickiness.mau} MAU
                </p>
                <div className="mt-3 w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{
                      width: `${Math.min(data.stickiness.ratio, 100)}%`,
                      backgroundColor: data.stickiness.ratio >= 20 ? "#10b981" : data.stickiness.ratio >= 10 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.stickiness.ratio >= 20 ? "Отлично (20%+)" : data.stickiness.ratio >= 10 ? "Нормально (10-20%)" : "Нужно улучшать (<10%)"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Ср. дней активности</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.stickiness.avg_days_active}</div>
                <p className="text-xs text-muted-foreground mt-1">За последние 30 дней на пользователя</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Time to Value
          </h2>
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">До первой вещи</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.timeToValue.avg_to_first_item_hours < 1
                    ? `${Math.round(data.timeToValue.avg_to_first_item_hours * 60)} мин`
                    : `${data.timeToValue.avg_to_first_item_hours} ч`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Среднее (медиана: {data.timeToValue.median_to_first_item_hours < 1
                    ? `${Math.round(data.timeToValue.median_to_first_item_hours * 60)} мин`
                    : `${data.timeToValue.median_to_first_item_hours} ч`})
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">До первого образа</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.timeToValue.avg_to_first_outfit_hours < 1
                    ? `${Math.round(data.timeToValue.avg_to_first_outfit_hours * 60)} мин`
                    : data.timeToValue.avg_to_first_outfit_hours < 24
                      ? `${data.timeToValue.avg_to_first_outfit_hours} ч`
                      : `${Math.round(data.timeToValue.avg_to_first_outfit_hours / 24)} дн`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Среднее время от регистрации</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Cohort Retention Table */}
      {data.cohortRetention && data.cohortRetention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Когортный Retention</CardTitle>
            <CardDescription>По неделе регистрации — % вернувшихся на неделе N</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Неделя</TableHead>
                  <TableHead className="text-center">Когорта</TableHead>
                  <TableHead className="text-center">W1</TableHead>
                  <TableHead className="text-center">W2</TableHead>
                  <TableHead className="text-center">W3</TableHead>
                  <TableHead className="text-center">W4</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cohortRetention.map((c) => (
                  <TableRow key={c.week}>
                    <TableCell className="font-medium text-sm">
                      {new Date(c.week).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                    </TableCell>
                    <TableCell className="text-center font-bold">{c.cohort_size}</TableCell>
                    {[c.week_1_pct, c.week_2_pct, c.week_3_pct, c.week_4_pct].map((pct, i) => (
                      <TableCell key={i} className="text-center">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: pct === 0 ? "#f3f4f6" : `rgba(16, 185, 129, ${Math.min(pct / 100, 0.8) + 0.1})`,
                            color: pct >= 30 ? "white" : pct > 0 ? "#065f46" : "#9ca3af",
                          }}
                        >
                          {pct}%
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Activation Analysis */}
      {data.activation && data.activation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activation: что предсказывает retention?</CardTitle>
            <CardDescription>D7 retention для пользователей, которые сделали / не сделали действие</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Действие</TableHead>
                  <TableHead className="text-center">Сделали</TableHead>
                  <TableHead className="text-center">D7 retention</TableHead>
                  <TableHead className="text-center">Не сделали</TableHead>
                  <TableHead className="text-center">D7 retention</TableHead>
                  <TableHead className="text-center">Разница</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activation.map((a) => {
                  const diff = a.did_retention_pct - a.didnt_retention_pct
                  const actionLabels: Record<string, string> = {
                    first_item: "Добавили вещь",
                    first_outfit: "Создали образ",
                    first_look_saved: "Сохранили look",
                  }
                  return (
                    <TableRow key={a.action}>
                      <TableCell className="font-medium">{actionLabels[a.action] || a.action}</TableCell>
                      <TableCell className="text-center">{a.did_total}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-green-600">{a.did_retention_pct}%</span>
                      </TableCell>
                      <TableCell className="text-center">{a.didnt_total}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-red-500">{a.didnt_retention_pct}%</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={diff > 10 ? "default" : "secondary"} className={diff > 10 ? "bg-green-600" : ""}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(1)}pp
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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

      {/* Paying Users */}
      {payingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Оплатившие пользователи ({payingUsers.length})
            </CardTitle>
            <CardDescription>Все пользователи с оплаченными транзакциями</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Email / Telegram</TableHead>
                  <TableHead>Подписка</TableHead>
                  <TableHead>Платежи</TableHead>
                  <TableHead>Дата регистрации</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payingUsers.map((pu) => (
                  <TableRow key={pu.user_id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{pu.full_name || "Пользователь"}</span>
                        <span className="text-xs text-muted-foreground">{pu.user_id.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {pu.email && <span className="text-sm">{pu.email}</span>}
                        {pu.telegram_username && <span className="text-xs text-blue-600">@{pu.telegram_username}</span>}
                        {pu.telegram_id && <span className="text-xs text-muted-foreground">TG ID: {pu.telegram_id}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {pu.sub_status === "active" ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="default" className="bg-green-600 w-fit">
                            {pu.subscription_type === "yearly" ? "Pro (год)" : "Pro (мес)"}
                          </Badge>
                          {pu.sub_expires && (
                            <span className="text-xs text-muted-foreground">
                              до {new Date(pu.sub_expires).toLocaleDateString("ru")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">Истекла</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {pu.payments.map((p, i) => (
                          <span key={i} className="text-xs">
                            {p.amount} RUB — {p.action === "subscribe" ? `подписка ${p.type}` : "кредиты"}
                            <span className="text-muted-foreground ml-1">
                              ({new Date(p.date).toLocaleDateString("ru")})
                            </span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {pu.registered_at ? new Date(pu.registered_at).toLocaleDateString("ru") : "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
