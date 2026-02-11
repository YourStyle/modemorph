"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { api } from "@/lib/api-client"
import { Send, Loader2 } from "lucide-react"

interface Broadcast {
  id: number
  message_text: string
  recipient_filter: { type: string }
  total_sent: number
  total_failed: number
  created_at: string
}

const FILTER_LABELS: Record<string, string> = {
  all: "Все пользователи",
  subscribers: "Подписчики",
  free: "Бесплатные",
}

export default function AdminBroadcastsPage() {
  const [message, setMessage] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [sending, setSending] = useState(false)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBroadcasts()
  }, [])

  const loadBroadcasts = async () => {
    try {
      const data = await api.get("/api/admin/broadcast")
      setBroadcasts(data.broadcasts || [])
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить историю рассылок", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!message.trim()) return
    if (!confirm(`Отправить рассылку для "${FILTER_LABELS[filterType]}"?`)) return

    setSending(true)
    try {
      const result = await api.post("/api/admin/broadcast", {
        message: message.trim(),
        filter: { type: filterType },
      })

      toast({
        title: "Рассылка отправлена",
        description: `Отправлено: ${result.sent}, ошибок: ${result.failed}`,
      })
      setMessage("")
      loadBroadcasts()
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось отправить рассылку",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Рассылки</h1>
        <p className="text-muted-foreground mt-2">Отправка сообщений пользователям через Telegram</p>
      </div>

      {/* Compose */}
      <Card>
        <CardHeader>
          <CardTitle>Новая рассылка</CardTitle>
          <CardDescription>
            Поддерживается HTML: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;a href=&quot;...&quot;&gt;ссылка&lt;/a&gt;
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Текст сообщения</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Введите текст сообщения..."
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Получатели</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все пользователи</SelectItem>
                <SelectItem value="subscribers">Только подписчики</SelectItem>
                <SelectItem value="free">Только бесплатные</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="gap-2"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending ? "Отправка..." : "Отправить"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>История рассылок</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : broadcasts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Рассылок пока нет</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Сообщение</TableHead>
                  <TableHead>Получатели</TableHead>
                  <TableHead>Отправлено</TableHead>
                  <TableHead>Ошибки</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(b.created_at).toLocaleString("ru-RU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {b.message_text}
                    </TableCell>
                    <TableCell className="text-sm">
                      {FILTER_LABELS[b.recipient_filter?.type] || b.recipient_filter?.type || "все"}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-green-600">
                      {b.total_sent}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-red-600">
                      {b.total_failed}
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
