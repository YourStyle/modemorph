import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings, Palette, Bell, Shield, Database } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Заголовок */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Настройки</h1>
            <p className="text-gray-600">Управление настройками приложения и аккаунта</p>
          </div>

          {/* Сетка настроек */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Внешний вид */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Palette className="h-5 w-5" />
                  Внешний вид
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Тема оформления</h4>
                  <p className="text-sm text-gray-600 mb-3">Выберите светлую или темную тему</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Размер шрифта</h4>
                  <p className="text-sm text-gray-600 mb-3">Настройте размер текста для удобства</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
              </CardContent>
            </Card>

            {/* Уведомления */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Bell className="h-5 w-5" />
                  Уведомления
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Email уведо��ления</h4>
                  <p className="text-sm text-gray-600 mb-3">Получайте уведомления на почту</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Push уведомления</h4>
                  <p className="text-sm text-gray-600 mb-3">Уведомления в браузере</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
              </CardContent>
            </Card>

            {/* Безопасность */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Shield className="h-5 w-5" />
                  Безопасность
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Смена пароля</h4>
                  <p className="text-sm text-gray-600 mb-3">Обновите пароль для безопасности</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Двухфакторная аутентификация</h4>
                  <p className="text-sm text-gray-600 mb-3">Дополнительная защита аккаунта</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
              </CardContent>
            </Card>

            {/* Данные */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Database className="h-5 w-5" />
                  Управление данными
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Экспорт данных</h4>
                  <p className="text-sm text-gray-600 mb-3">Скачайте копию ваших данных</p>
                  <div className="text-sm text-blue-600">Скоро будет доступно</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="font-medium mb-2 text-red-800">Удаление аккаунта</h4>
                  <p className="text-sm text-red-600 mb-3">Безвозвратное удаление всех данных</p>
                  <div className="text-sm text-red-600">Обратитесь в поддержку</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Информация о версии */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Settings className="h-5 w-5" />О приложении
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">v1.0.0</div>
                  <div className="text-sm text-gray-600">Версия приложения</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">200+</div>
                  <div className="text-sm text-gray-600">Элементов в базе</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">∞</div>
                  <div className="text-sm text-gray-600">Возможностей стиля</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
