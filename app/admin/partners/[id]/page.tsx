"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Check,
  X,
  Key,
  FileUp,
  Activity,
  ExternalLink,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow, format } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface PartnerDetail {
  partner: {
    id: number
    company_name: string
    contact_name: string
    website: string | null
    description: string | null
    status: string
    rejected_reason: string | null
    approved_at: string | null
    created_at: string
  }
  tokens: Array<{
    id: number
    name: string
    token_prefix: string
    is_active: boolean
    created_at: string
    last_used_at: string | null
  }>
  feeds: Array<{
    id: number
    file_name: string
    status: string
    items_imported: number
    items_skipped: number
    created_at: string
  }>
  recent_usage: Array<{
    id: number
    endpoint: string
    status_code: number
    error_code: string | null
    latency_ms: number | null
    created_at: string
  }>
  stats: {
    total_calls: number
    success_calls: number
  }
}

export default function AdminPartnerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [data, setData] = useState<PartnerDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const loadPartner = async () => {
    try {
      const result = await api.get<PartnerDetail>(`/api/admin/partners/${params.id}`)
      setData(result)
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPartner()
  }, [params.id])

  const handleStatusChange = async (status: string) => {
    setActionLoading(true)
    try {
      await api.patch(`/api/admin/partners/${params.id}`, { status })
      toast({ title: `Статус изменён на "${status}"` })
      loadPartner()
    } catch {
      toast({ title: "Ошибка", variant: "destructive" })
    } finally {
      setActionLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) return <div className="text-center py-20 text-gray-500">Партнёр не найден</div>

  const { partner, tokens, feeds, recent_usage, stats } = data
  const successRate = stats.total_calls > 0
    ? Math.round((stats.success_calls / stats.total_calls) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/partners")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Назад
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{partner.company_name}</h1>
          <p className="text-sm text-gray-500">{partner.contact_name}</p>
        </div>
        <StatusBadge status={partner.status} />
      </div>

      {/* Info + Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Информация</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {partner.website && (
              <div>
                <span className="text-gray-500">Сайт: </span>
                <a href={partner.website} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                  {partner.website} <ExternalLink className="h-3 w-3 inline" />
                </a>
              </div>
            )}
            {partner.description && (
              <div>
                <span className="text-gray-500">Описание: </span>
                {partner.description}
              </div>
            )}
            <div>
              <span className="text-gray-500">Регистрация: </span>
              {format(new Date(partner.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
            </div>
            {partner.approved_at && (
              <div>
                <span className="text-gray-500">Одобрен: </span>
                {format(new Date(partner.approved_at), "dd.MM.yyyy HH:mm", { locale: ru })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Статистика</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Всего вызовов</span>
              <span className="font-medium">{stats.total_calls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Успешных</span>
              <span className="font-medium text-green-600">{stats.success_calls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">% успеха</span>
              <span className="font-medium">{successRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Токенов</span>
              <span className="font-medium">{tokens.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Фидов</span>
              <span className="font-medium">{feeds.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Действия</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {partner.status === "pending" && (
              <>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => handleStatusChange("approved")}
                  disabled={actionLoading}
                >
                  <Check className="h-4 w-4 mr-2" /> Одобрить
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => handleStatusChange("rejected")}
                  disabled={actionLoading}
                >
                  <X className="h-4 w-4 mr-2" /> Отклонить
                </Button>
              </>
            )}
            {partner.status === "approved" && (
              <Button
                variant="outline"
                className="w-full text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => handleStatusChange("suspended")}
                disabled={actionLoading}
              >
                Приостановить
              </Button>
            )}
            {partner.status === "suspended" && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => handleStatusChange("approved")}
                disabled={actionLoading}
              >
                Восстановить
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tokens */}
      {tokens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" /> API токены
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Префикс</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Последнее использование</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell className="font-mono text-sm">{token.token_prefix}...</TableCell>
                    <TableCell>
                      <Badge variant={token.is_active ? "default" : "secondary"}>
                        {token.is_active ? "Активен" : "Отозван"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {token.last_used_at
                        ? formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: ru })
                        : "Не использовался"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent API calls */}
      {recent_usage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Последние вызовы API
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Эндпоинт</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Ошибка</TableHead>
                  <TableHead>Время (мс)</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent_usage.slice(0, 20).map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-mono text-sm">{call.endpoint}</TableCell>
                    <TableCell>
                      <Badge variant={call.status_code === 200 ? "default" : "destructive"}>
                        {call.status_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {call.error_code || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{call.latency_ms ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {format(new Date(call.created_at), "dd.MM HH:mm:ss")}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    pending: { variant: "outline", label: "Ожидает" },
    approved: { variant: "default", label: "Одобрен" },
    rejected: { variant: "destructive", label: "Отклонён" },
    suspended: { variant: "secondary", label: "Приостановлен" },
  }
  const { variant, label } = map[status] ?? map.pending
  return <Badge variant={variant} className="text-base px-3 py-1">{label}</Badge>
}
