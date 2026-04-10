"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  FileText,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"

interface FeedDetail {
  feed: {
    id: number
    file_name: string
    file_url: string
    status: string
    items_total: number
    items_imported: number
    items_skipped: number
    error_log: string | null
    created_at: string
    completed_at: string | null
  }
  items_in_db: number
}

export default function FeedDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [data, setData] = useState<FeedDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.get<FeedDetail>(`/api/partner/feeds/${params.id}`)
        setData(result)
      } catch {
        // ignore
      } finally {
        setIsLoading(false)
      }
    }
    load()

    // Poll while processing
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [params.id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-20 text-gray-500">Фид не найден</div>
  }

  const { feed, items_in_db } = data

  const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
    pending: { label: "Ожидает обработки", color: "text-yellow-600", icon: Clock },
    processing: { label: "Обрабатывается...", color: "text-blue-600", icon: RefreshCw },
    completed: { label: "Завершён", color: "text-green-600", icon: CheckCircle2 },
    failed: { label: "Ошибка", color: "text-red-600", icon: XCircle },
  }

  const cfg = statusConfig[feed.status] || statusConfig.pending
  const StatusIcon = cfg.icon

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/partner/feeds")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Назад
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6" />
            {feed.file_name}
          </h1>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Статус</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className={`flex items-center gap-2 text-lg font-medium ${cfg.color}`}>
              <StatusIcon className={`h-5 w-5 ${feed.status === "processing" ? "animate-spin" : ""}`} />
              {cfg.label}
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              <div>Загружен: {format(new Date(feed.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}</div>
              {feed.completed_at && (
                <div>Завершён: {format(new Date(feed.completed_at), "dd.MM.yyyy HH:mm", { locale: ru })}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Результаты</CardTitle></CardHeader>
          <CardContent>
            {feed.status === "completed" ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{feed.items_imported}</div>
                  <div className="text-sm text-gray-500">Импортировано</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-500">{feed.items_skipped}</div>
                  <div className="text-sm text-gray-500">Пропущено</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{feed.items_total}</div>
                  <div className="text-sm text-gray-500">Всего в фиде</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{items_in_db}</div>
                  <div className="text-sm text-gray-500">В базе данных</div>
                </div>
              </div>
            ) : feed.status === "failed" ? (
              <div className="text-sm text-red-600">
                {feed.error_log || "Неизвестная ошибка"}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Результаты появятся после обработки фида
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {feed.error_log && feed.status === "failed" && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-red-600">Лог ошибок</CardTitle></CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-sm overflow-x-auto whitespace-pre-wrap">
              {feed.error_log}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
