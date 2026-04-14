"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { api } from "@/lib/api-client"
import { Plus, Trash2, Loader2, Play } from "lucide-react"

interface ReminderConfig {
  id: number
  name: string
  message_template: string
  reminder_type: string
  day_of_week: number | null
  conditions: Record<string, any>
  is_active: boolean
  created_at: string
}

const DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

export default function AdminRemindersPage() {
  const [reminders, setReminders] = useState<ReminderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // New reminder form
  const [newName, setNewName] = useState("")
  const [newTemplate, setNewTemplate] = useState("")
  const [newType, setNewType] = useState("daily")
  const [newDayOfWeek, setNewDayOfWeek] = useState<string>("")

  useEffect(() => {
    loadReminders()
  }, [])

  const loadReminders = async () => {
    try {
      const data = await api.get("/api/admin/reminders")
      setReminders(data.reminders || [])
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить напоминания", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newTemplate.trim()) return
    setCreating(true)
    try {
      await api.post("/api/admin/reminders", {
        name: newName.trim(),
        message_template: newTemplate.trim(),
        reminder_type: newType,
        day_of_week: newType === "day_of_week" ? parseInt(newDayOfWeek) : null,
      })
      toast({ title: "Создано", description: "Напоминание добавлено" })
      setNewName("")
      setNewTemplate("")
      setNewType("daily")
      setNewDayOfWeek("")
      setDialogOpen(false)
      loadReminders()
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (id: number, isActive: boolean) => {
    try {
      await api.patch("/api/admin/reminders", { id, is_active: isActive })
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r))
      )
    } catch {
      toast({ title: "Ошибка", description: "Не удалось обновить статус", variant: "destructive" })
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить это напоминание?")) return
    try {
      await api.delete("/api/admin/reminders", { body: { id } })
      setReminders((prev) => prev.filter((r) => r.id !== id))
      toast({ title: "Удалено" })
    } catch {
      toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" })
    }
  }

  const handleTestCron = async () => {
    toast({ title: "Информация", description: "Для тестирования вызовите POST /api/cron/send-reminders с заголовком Authorization: Bearer <CRON_SECRET>" })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Напоминания</h1>
          <p className="text-muted-foreground mt-2">
            Настройка автоматических напоминаний через Telegram
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTestCron} className="gap-2">
            <Play className="h-4 w-4" />
            Тест
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Создать
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новое напоминание</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Название</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Утреннее напоминание"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Шаблон сообщения</Label>
                  <Textarea
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    placeholder="Привет, {name}! Сегодня {day}. Загляни в свой гардероб!"
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Переменные: {"{name}"}, {"{day}"}. Поддерживается HTML.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Тип</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Ежедневно</SelectItem>
                      <SelectItem value="day_of_week">По дню недели</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newType === "day_of_week" && (
                  <div className="space-y-2">
                    <Label>День недели</Label>
                    <Select value={newDayOfWeek} onValueChange={setNewDayOfWeek}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите день" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_NAMES.map((name, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Предпросмотр:</p>
                  <p className="text-sm">
                    {newTemplate
                      .replace("{name}", "Анна")
                      .replace("{day}", "Понедельник") || "—"}
                  </p>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newTemplate.trim() || creating}
                  className="w-full"
                >
                  {creating ? "Создание..." : "Создать напоминание"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Напоминания не настроены</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <Card key={reminder.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{reminder.name}</CardTitle>
                    <CardDescription>
                      {reminder.reminder_type === "daily"
                        ? "Ежедневно"
                        : `По ${DAY_NAMES[reminder.day_of_week!]}м`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={reminder.is_active}
                      onCheckedChange={(checked) => handleToggle(reminder.id, checked)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(reminder.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-mono whitespace-pre-wrap">{reminder.message_template}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
