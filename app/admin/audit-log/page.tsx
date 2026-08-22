"use client"

/**
 * Журнал действий персонала под /api/admin/*.
 *
 * Виден только админу — в этом весь смысл: супер-админ должен видеть, что делает
 * аналитик, и это перестаёт быть правдой, как только аналитик может сам читать
 * и фильтровать журнал.
 *
 * Отказы показываются наравне с успехами и по-своему интереснее: 403 на выдаче
 * кредитов — единственный видимый признак того, что кто-то пробует границу.
 */

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, ScrollText } from "lucide-react"

interface Entry {
  occurred_at: string | null
  actor: string
  role: string
  method: string
  path: string
  status: number | null
  denied: boolean
  body: Record<string, unknown> | null
  ip: string | null
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [since, setSince] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [actor, setActor] = useState("")
  const [onlyDenied, setOnlyDenied] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (actor) qs.set("actor", actor)
      if (onlyDenied) qs.set("only_denied", "true")
      const d = await api.get<{ entries: Entry[]; recording_since: string }>(
        `/api/admin/audit-log?${qs}`)
      setEntries(d.entries || [])
      setSince(d.recording_since)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [onlyDenied])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <ScrollText className="h-6 w-6" />
          Журнал действий
        </h1>
        <p className="text-ink-2 mt-1">
          Все изменяющие вызовы админки, включая отклонённые
        </p>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <Input
          placeholder="Фильтр по почте"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          className="max-w-xs"
        />
        <Button variant={onlyDenied ? "default" : "outline"} onClick={() => setOnlyDenied(!onlyDenied)}>
          Только отказы
        </Button>
        <Button variant="outline" onClick={load}>Обновить</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Записи</CardTitle>
          {/* Пустой журнал — это «запись включена недавно», а не «никто ничего
              не делал». Разница существенная, поэтому дата названа явно. */}
          <CardDescription>
            Запись ведётся с {since || "момента выкатки"}. За более ранние действия
            записей нет и не будет — их никто не сохранял.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead>Кто</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Действие</TableHead>
                  <TableHead>Итог</TableHead>
                  <TableHead>Данные</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i} className={e.denied ? "bg-destructive/5" : undefined}>
                    <TableCell className="text-ink-2 whitespace-nowrap text-xs">
                      {e.occurred_at?.replace("T", " ").slice(0, 19) || "—"}
                    </TableCell>
                    <TableCell className="text-ink">{e.actor}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.role}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-2">
                      {e.method} {e.path}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.denied ? "destructive" : "outline"}>{e.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      {e.body ? (
                        <code className="text-xs text-ink-3 break-all">
                          {JSON.stringify(e.body).slice(0, 160)}
                        </code>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-ink-2 py-10">
                      Записей пока нет
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
