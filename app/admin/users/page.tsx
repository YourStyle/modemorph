"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { api } from "@/lib/api-client"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Users, TrendingUp, Calendar, CreditCard, Loader2 } from "lucide-react"

interface User {
  id: number
  user_id: string
  full_name: string
  is_admin: boolean
  created_at: string
  updated_at: string
  email: string | null
  user_subscriptions: Array<{
    subscription_type: string
    status: string
    start_date: string
    end_date: string
    credits_included: number
  }>
  user_credits: Array<{
    credits_balance: number
    updated_at: string
  }>
  limits: Array<{
    wardrobe_items_anlyzed: number
    ai_requests: number
    ideas_viewed: number
    outfits_saved: number
    vton_used: number
  }>
}

interface Metrics {
  summary: {
    totalUsers: number
    mau: number
    dau: number
    activeSubscriptions: number
  }
  charts: {
    registrations: Array<{ date: string; count: number }>
    activity: Array<{ date: string; count: number }>
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [grantCredits, setGrantCredits] = useState("")
  const [grantSubscription, setGrantSubscription] = useState("")
  const [subscriptionDuration, setSubscriptionDuration] = useState("")

  useEffect(() => {
    fetchUsers()
    fetchMetrics()
  }, [])

  const fetchUsers = async () => {
    try {
      const data = await api.get("/api/admin/users")
      setUsers(data.users)
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить пользователей",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchMetrics = async () => {
    try {
      const data = await api.get("/api/admin/metrics")
      setMetrics(data)
    } catch (error) {
      console.error("Failed to load metrics:", error)
    } finally {
      setMetricsLoading(false)
    }
  }

  const handleGrantCreditsOrSubscription = async () => {
    if (!selectedUser) return

    try {
      await api.post("/api/admin/grant-credits", {
        userId: selectedUser.user_id,
        credits: grantCredits ? Number.parseInt(grantCredits) : 0,
        subscriptionType: grantSubscription || null,
        subscriptionDuration: subscriptionDuration || null,
      })
      toast({
        title: "Успешно",
        description: "Кредиты/подписка успешно начислены",
      })
      setGrantCredits("")
      setGrantSubscription("")
      setSubscriptionDuration("")
      setSelectedUser(null)
      fetchUsers()
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось начислить кредиты/подписку",
        variant: "destructive",
      })
    }
  }

  const getCurrentCredits = (user: User) => {
    return user.user_credits?.[0]?.credits_balance || 0
  }

  const getCurrentSubscription = (user: User) => {
    const activeSub = user.user_subscriptions?.find((sub) => sub.status === "active")
    return activeSub || null
  }

  const getRemainingLimits = (user: User) => {
    return user.limits?.[0] || null
  }

  if (loading || metricsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Управление пользователями</h1>
        <p className="text-muted-foreground mt-2">Аналитика и управление пользователями системы</p>
      </div>

      {/* Метрики */}
      {metrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Всего пользователей</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.totalUsers}</div>
                <p className="text-xs text-muted-foreground mt-1">Зарегистрированных аккаунтов</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MAU</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.mau}</div>
                <p className="text-xs text-muted-foreground mt-1">Активных за месяц</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DAU</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.dau}</div>
                <p className="text-xs text-muted-foreground mt-1">Активных за день</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Подписки</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.activeSubscriptions}</div>
                <p className="text-xs text-muted-foreground mt-1">Активных подписок</p>
              </CardContent>
            </Card>
          </div>

          {/* Графики */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Регистрации</CardTitle>
                <CardDescription>Новые пользователи за последние 30 дней</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics.charts.registrations}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString("ru")}
                      formatter={(value: number) => [`${value} польз.`, "Регистраций"]}
                    />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Активность</CardTitle>
                <CardDescription>Активные пользователи за последние 30 дней</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics.charts.activity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString("ru")}
                      formatter={(value: number) => [`${value} польз.`, "Активных"]}
                    />
                    <Line type="monotone" dataKey="count" stroke="#82ca9d" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Таблица пользователей */}
      <Card>
        <CardHeader>
          <CardTitle>Пользователи ({users.length})</CardTitle>
          <CardDescription>Список всех зарегистрированных пользователей</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Пользователь</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Кредиты</TableHead>
                <TableHead>Лимиты</TableHead>
                <TableHead>Дата регистрации</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const credits = getCurrentCredits(user)
                const subscription = getCurrentSubscription(user)
                const limits = getRemainingLimits(user)

                return (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.full_name || "Пользователь"}</span>
                        <span className="text-xs text-muted-foreground">{user.user_id.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{user.email || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.is_admin && <Badge variant="destructive">Админ</Badge>}
                        {subscription && (
                          <Badge variant="default" className="bg-purple-600">
                            {subscription.subscription_type === "pro" ? "Pro" : subscription.subscription_type}
                          </Badge>
                        )}
                        {!user.is_admin && !subscription && <Badge variant="secondary">Free</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-purple-600">{credits}</span>
                    </TableCell>
                    <TableCell>
                      {limits ? (
                        <div className="text-xs space-y-0.5">
                          <div>AI: {limits.ai_requests}</div>
                          <div>Гардероб: {limits.wardrobe_items_anlyzed}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), { addSuffix: true, locale: ru })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUser(user)}
                            disabled={user.is_admin}
                          >
                            Начислить
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Начислить кредиты/подписку</DialogTitle>
                          </DialogHeader>

                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="credits">Кредиты</Label>
                              <Input
                                id="credits"
                                type="number"
                                placeholder="Количество кредитов"
                                value={grantCredits}
                                onChange={(e) => setGrantCredits(e.target.value)}
                              />
                            </div>

                            <div>
                              <Label htmlFor="subscription">Подписка</Label>
                              <Select value={grantSubscription} onValueChange={setGrantSubscription}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Выберите подписку" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pro">Pro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {grantSubscription && (
                              <div>
                                <Label htmlFor="duration">Длительность</Label>
                                <Select value={subscriptionDuration} onValueChange={setSubscriptionDuration}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Выберите длительность" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="monthly">1 месяц</SelectItem>
                                    <SelectItem value="yearly">1 год</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            <Button
                              onClick={handleGrantCreditsOrSubscription}
                              className="w-full"
                              disabled={!grantCredits && !grantSubscription}
                            >
                              Начислить
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
