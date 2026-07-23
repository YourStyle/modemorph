"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Code2, Loader2, Globe } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"

interface AdminWidgetKey {
  id: number
  partner_id: number
  company_name: string
  name: string
  key_prefix: string
  allowed_origins: string[]
  is_active: boolean
  rate_limit_per_minute: number
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
  events_total: number
  impressions: number
  conversions: number
}

export default function AdminWidgetKeysPage() {
  const [keys, setKeys] = useState<AdminWidgetKey[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ keys: AdminWidgetKey[] }>("/api/admin/widget-keys")
      .then((d) => setKeys(d.keys))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const active = keys.filter((k) => k.is_active).length
  const impressions = keys.reduce((s, k) => s + (k.impressions || 0), 0)
  const conversions = keys.reduce((s, k) => s + (k.conversions || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Code2 className="h-6 w-6" />
          Виджет-ключи партнёров
        </h1>
        <p className="text-gray-500 mt-1">Обзор встраиваемых виджетов: домены, активность, конверсия.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ключей всего", value: keys.length },
          { label: "Активных", value: active },
          { label: "Показов", value: impressions },
          { label: "В корзину", value: conversions },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{m.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Code2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Ни один партнёр ещё не создал виджет-ключ</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Партнёр</TableHead>
                  <TableHead>Ключ</TableHead>
                  <TableHead>Домены</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Показы</TableHead>
                  <TableHead className="text-right">В корзину</TableHead>
                  <TableHead>Последнее использование</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <div className="font-medium">{k.company_name}</div>
                      <div className="text-xs text-gray-400">{k.name}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">{k.key_prefix}…</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {(k.allowed_origins || []).map((o) => (
                          <Badge key={o} variant="secondary" className="font-normal text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            {o.replace(/^https?:\/\//, "")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "default" : "secondary"}>
                        {k.is_active ? "Активен" : "Отозван"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{k.impressions}</TableCell>
                    <TableCell className="text-right tabular-nums">{k.conversions}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {k.last_used_at
                        ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true, locale: ru })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
