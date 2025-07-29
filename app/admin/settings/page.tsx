"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Settings, Users, Database, Shield, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { YandexMigrationCard } from "@/components/yandex-migration-card"

interface SystemStats {
  totalUsers: number
  totalItems: number
  totalOutfits: number
  storageUsed: string
}

export default function AdminSettingsPage() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({
    maintenanceMode: false,
    registrationEnabled: true,
    emailNotifications: true,
    autoBackup: true,
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      // Здесь будет запрос к API для получения статистики
      // Пока используем моковые данные
      setStats({
        totalUsers: 1247,
        totalItems: 8934,
        totalOutfits: 2156,
        storageUsed: "2.4 GB",
      })
    } catch (error) {
      console.error("Error fetching stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSettingChange = (key: string, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    toast({
      title: "Настройка обновлена",
      description: `${key} ${value ? "включено" : "отключено"}`,
    })
  }

  const handleClearCache = () => {
    toast({
      title: "Кэш очищен",
      description: "Системный кэш успешно очищен",
    })
  }

  const handleBackupDatabase = () => {
    toast({
      title: "Резервное копирование запущено",
      description: "Создание резервной копии базы данных началось",
    })
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Заголовок */}
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-gray-700" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Настройки системы</h1>
            <p className="text-gray-600">Управление системными параметрами и конфигурацией</p>
          </div>
        </div>

        {/* Миграция Blob Storage - приоритетная карточка */}
        <YandexMigrationCard />

        {/* Системная статистика */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Системная статистика
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="text-center p-4 bg-gray-50 rounded-lg animate-pulse">
                    <div className="h-8 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats?.totalUsers}</div>
                  <div className="text-sm text-blue-600">Пользователей</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats?.totalItems}</div>
                  <div className="text-sm text-green-600">Вещей</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{stats?.totalOutfits}</div>
                  <div className="text-sm text-purple-600">Образов</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{stats?.storageUsed}</div>
                  <div className="text-sm text-orange-600">Хранилище</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Основные настройки */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Основные настройки
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="maintenance">Режим обслуживания</Label>
                <p className="text-sm text-gray-500">Временно отключить доступ к сайту для пользователей</p>
              </div>
              <Switch
                id="maintenance"
                checked={settings.maintenanceMode}
                onCheckedChange={(value) => handleSettingChange("maintenanceMode", value)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="registration">Регистрация новых пользователей</Label>
                <p className="text-sm text-gray-500">Разрешить создание новых аккаунтов</p>
              </div>
              <Switch
                id="registration"
                checked={settings.registrationEnabled}
                onCheckedChange={(value) => handleSettingChange("registrationEnabled", value)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="notifications">Email уведомления</Label>
                <p className="text-sm text-gray-500">Отправка системных уведомлений по email</p>
              </div>
              <Switch
                id="notifications"
                checked={settings.emailNotifications}
                onCheckedChange={(value) => handleSettingChange("emailNotifications", value)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="backup">Автоматическое резервное копирование</Label>
                <p className="text-sm text-gray-500">Ежедневное создание резервных копий</p>
              </div>
              <Switch
                id="backup"
                checked={settings.autoBackup}
                onCheckedChange={(value) => handleSettingChange("autoBackup", value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Управление пользователями */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Управление пользователями
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxUsers">Максимальное количество пользователей</Label>
                <Input id="maxUsers" type="number" placeholder="10000" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="sessionTimeout">Время сессии (минуты)</Label>
                <Input id="sessionTimeout" type="number" placeholder="1440" className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Системные операции */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Системные операции
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button onClick={handleClearCache} variant="outline" className="h-auto p-4 bg-transparent">
                <div className="text-center">
                  <Trash2 className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">Очистить кэш</div>
                  <div className="text-sm text-gray-500">Очистить системный кэш</div>
                </div>
              </Button>

              <Button onClick={handleBackupDatabase} variant="outline" className="h-auto p-4 bg-transparent">
                <div className="text-center">
                  <Database className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">Резервная копия</div>
                  <div className="text-sm text-gray-500">Создать резервную копию БД</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Информация о системе */}
        <Card>
          <CardHeader>
            <CardTitle>Информация о системе</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-500">Версия приложения</Label>
                <div className="mt-1">
                  <Badge variant="secondary">v1.2.0</Badge>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">Последнее обновление</Label>
                <div className="mt-1 text-sm">15 января 2024</div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">Время работы сервера</Label>
                <div className="mt-1 text-sm">7 дней 14 часов</div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">Статус системы</Label>
                <div className="mt-1">
                  <Badge variant="default" className="bg-green-500">
                    Работает
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
