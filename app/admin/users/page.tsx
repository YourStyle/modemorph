"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"

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
  daily_usage_limits: Array<{
    last_reset_date: string
    wardrobe_items_today: number
    ai_requests_today: number
    ideas_viewed_today: number
    outfits_saved_today: number
  }>
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [grantCredits, setGrantCredits] = useState("")
  const [grantSubscription, setGrantSubscription] = useState("")
  const [subscriptionDuration, setSubscriptionDuration] = useState("")

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/admin/users")
      const data = await response.json()

      if (response.ok) {
        setUsers(data.users)
      } else {
        toast({
          title: "Ошибка",
          description: data.error || "Не удалось загрузить пользователей",
          variant: "destructive",
        })
      }
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

  const handleGrantCreditsOrSubscription = async () => {
    if (!selectedUser) return

    try {
      const response = await fetch("/api/admin/grant-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: selectedUser.user_id,
          credits: grantCredits ? Number.parseInt(grantCredits) : 0,
          subscriptionType: grantSubscription || null,
          subscriptionDuration: subscriptionDuration || null,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Успешно",
          description: "Кредиты/подписка успешно начислены",
        })
        setGrantCredits("")
        setGrantSubscription("")
        setSubscriptionDuration("")
        setSelectedUser(null)
        fetchUsers()
      } else {
        toast({
          title: "Ошибка",
          description: data.error || "Не удалось начислить кредиты/подписку",
          variant: "destructive",
        })
      }
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

  const getTodayUsage = (user: User) => {
    return user.daily_usage_limits?.[0] || null
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Загрузка пользователей...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Управление пользователями</h1>
        <Badge variant="secondary">{users.length} пользователей</Badge>
      </div>

      <div className="grid gap-4">
        {users.map((user) => {
          const credits = getCurrentCredits(user)
          const subscription = getCurrentSubscription(user)
          const todayUsage = getTodayUsage(user)

          return (
            <Card key={user.user_id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{user.full_name || "Пользователь"}</h3>
                    {user.is_admin && <Badge variant="destructive">Админ</Badge>}
                    {subscription && (
                      <Badge variant="default" className="bg-purple-600">
                        {subscription.subscription_type === "pro" ? "Pro" : subscription.subscription_type}
                      </Badge>
                    )}
                  </div>

                  <div className="mb-3 text-sm text-gray-500">
                    <div>ID: {user.user_id}</div>
                    {user.email && <div>Email: {user.email}</div>}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                    <div>
                      <div className="font-medium">Кредиты</div>
                      <div className="text-lg font-bold text-purple-600">{credits}</div>
                    </div>

                    <div>
                      <div className="font-medium">Подписка</div>
                      <div>
                        {subscription
                          ? `${subscription.subscription_type} до ${new Date(subscription.end_date).toLocaleDateString("ru")}`
                          : "Нет"}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium">Последняя активность</div>
                      <div>
                        {user.updated_at
                          ? formatDistanceToNow(new Date(user.updated_at), { addSuffix: true, locale: ru })
                          : "Никогда"}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium">Использование сегодня</div>
                      <div className="text-xs">
                        {todayUsage ? (
                          <>
                            Гардероб: {5 - todayUsage.wardrobe_items_today}/5
                            <br />
                            ИИ: {(subscription ? 20 : 1) - todayUsage.ai_requests_today}/{subscription ? "20" : "1"}
                            <br />
                            Идеи: {10 - todayUsage.ideas_viewed_today}/10
                            <br />
                            Образы: {20 - todayUsage.outfits_saved_today}/20
                          </>
                        ) : (
                          "Нет активности"
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => setSelectedUser(user)} disabled={user.is_admin}>
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
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
