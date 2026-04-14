"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { api } from "@/lib/api-client"
import { Send, Loader2, Search } from "lucide-react"

interface Broadcast {
  id: number
  message_text: string
  recipient_filter: { type: string; user_id?: string; user_name?: string }
  total_sent: number
  total_failed: number
  created_at: string
}

interface UserEntry {
  user_id: string
  full_name: string | null
  email: string | null
}

const FILTER_LABELS: Record<string, string> = {
  all: "Все пользователи",
  subscribers: "Подписчики",
  free: "Бесплатные",
  user: "Конкретный пользователь",
}

export default function AdminBroadcastsPage() {
  const [message, setMessage] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [sending, setSending] = useState(false)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)

  // User search
  const [users, setUsers] = useState<UserEntry[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    loadBroadcasts()
  }, [])

  useEffect(() => {
    if (filterType === "user" && users.length === 0) {
      loadUsers()
    }
  }, [filterType])

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

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const data = await api.get("/api/admin/users")
      setUsers(
        (data.users || []).map((u: any) => ({
          user_id: u.user_id,
          full_name: u.full_name,
          email: u.email,
        }))
      )
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить список пользователей", variant: "destructive" })
    } finally {
      setUsersLoading(false)
    }
  }

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q)
    )
  }, [users, searchQuery])

  const handleSelectUser = (user: UserEntry) => {
    setSelectedUser(user)
    setSearchQuery(user.full_name || user.email || user.user_id)
    setShowDropdown(false)
  }

  const getConfirmText = () => {
    if (filterType === "user" && selectedUser) {
      return `Отправить сообщение пользователю "${selectedUser.full_name || selectedUser.email || selectedUser.user_id}"?`
    }
    return `Отправить рассылку для "${FILTER_LABELS[filterType]}"?`
  }

  const canSend = () => {
    if (!message.trim() || sending) return false
    if (filterType === "user" && !selectedUser) return false
    return true
  }

  const handleSend = async () => {
    if (!canSend()) return
    if (!confirm(getConfirmText())) return

    setSending(true)
    try {
      const filter: any = { type: filterType }
      if (filterType === "user" && selectedUser) {
        filter.user_id = selectedUser.user_id
        filter.user_name = selectedUser.full_name || selectedUser.email
      }

      const result = await api.post("/api/admin/broadcast", {
        message: message.trim(),
        filter,
      })

      toast({
        title: "Рассылка отправлена",
        description: `Отправлено: ${result.sent}, ошибок: ${result.failed}`,
      })
      setMessage("")
      setSelectedUser(null)
      setSearchQuery("")
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

  const getRecipientLabel = (filter: Broadcast["recipient_filter"]) => {
    if (filter?.type === "user") {
      return filter.user_name || filter.user_id || "пользователь"
    }
    return FILTER_LABELS[filter?.type] || filter?.type || "все"
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Рассылки</h1>
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
            <Select
              value={filterType}
              onValueChange={(v) => {
                setFilterType(v)
                setSelectedUser(null)
                setSearchQuery("")
              }}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все пользователи</SelectItem>
                <SelectItem value="subscribers">Только подписчики</SelectItem>
                <SelectItem value="free">Только бесплатные</SelectItem>
                <SelectItem value="user">Конкретный пользователь</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User search — shown only when "user" filter selected */}
          {filterType === "user" && (
            <div className="space-y-2">
              <Label>Поиск пользователя</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedUser(null)
                    setShowDropdown(true)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Имя, email или ID..."
                  className="pl-9"
                />
                {showDropdown && searchQuery && !selectedUser && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {usersLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-3 py-3">Не найдено</p>
                    ) : (
                      filteredUsers.slice(0, 20).map((u) => (
                        <button
                          key={u.user_id}
                          onClick={() => handleSelectUser(u)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                        >
                          <span className="font-medium">{u.full_name || "—"}</span>
                          {u.email && (
                            <span className="text-muted-foreground ml-2">{u.email}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedUser && (
                <p className="text-sm text-green-600">
                  Выбран: {selectedUser.full_name || selectedUser.email || selectedUser.user_id}
                </p>
              )}
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={!canSend()}
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
                      {getRecipientLabel(b.recipient_filter)}
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
