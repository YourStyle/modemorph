"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Key, FileUp, BarChart3, ArrowRight, Activity, CheckCircle2, XCircle } from "lucide-react"
import Link from "next/link"

interface DashboardStats {
  tokens_count: number
  feeds_count: number
  api_calls_today: number
  api_calls_total: number
  success_rate: number
}

export default function PartnerDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await api.get<DashboardStats>("/api/partner/usage?summary=true")
        setStats(data)
      } catch (error) {
        console.error("[PartnerDashboard] Failed to load stats:", error)
        // Set defaults on error
        setStats({
          tokens_count: 0,
          feeds_count: 0,
          api_calls_today: 0,
          api_calls_total: 0,
          success_rate: 0,
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="text-gray-500 mt-1">Обзор вашей партнёрской активности</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="API вызовы сегодня"
          value={isLoading ? "..." : String(stats?.api_calls_today ?? 0)}
          icon={Activity}
        />
        <StatsCard
          title="Всего вызовов"
          value={isLoading ? "..." : String(stats?.api_calls_total ?? 0)}
          icon={BarChart3}
        />
        <StatsCard
          title="Успешных"
          value={isLoading ? "..." : `${stats?.success_rate ?? 0}%`}
          icon={CheckCircle2}
          iconColor="text-green-600"
        />
        <StatsCard
          title="Активных токенов"
          value={isLoading ? "..." : String(stats?.tokens_count ?? 0)}
          icon={Key}
          iconColor="text-blue-600"
        />
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <QuickAction
          href="/partner/tokens"
          icon={Key}
          title="API токены"
          description="Создайте и управляйте токенами для доступа к API"
        />
        <QuickAction
          href="/partner/feeds"
          icon={FileUp}
          title="XML фиды"
          description="Загрузите каталог товаров для системы рекомендаций"
        />
        <QuickAction
          href="/partner/stats"
          icon={BarChart3}
          title="Статистика"
          description="Детальная аналитика использования API"
        />
      </div>

      {/* API docs card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Быстрый старт</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-900 rounded-xl p-4 text-sm font-mono text-gray-100 overflow-x-auto">
            <div className="text-gray-400"># Виртуальная примерка</div>
            <div>
              curl -X POST https://your-domain.com/api/v1/vton \
            </div>
            <div className="pl-4">
              -H &quot;X-API-Key: mm_pk_your_token&quot; \
            </div>
            <div className="pl-4">
              -F &quot;person_photo=@person.jpg&quot; \
            </div>
            <div className="pl-4">
              -F &quot;clothing_photo=@clothing.jpg&quot;
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Отправьте фото человека и фото вещи — получите изображение виртуальной примерки.
            Фотографии проходят AI-валидацию перед обработкой.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function StatsCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-gray-600",
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{title}</div>
      </CardContent>
    </Card>
  )
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
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
