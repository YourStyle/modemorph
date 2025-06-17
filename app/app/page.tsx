import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Calendar, Palette, Sparkles } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { isUserAdmin } from "@/lib/admin"

export default async function AppPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const isAdmin = await isUserAdmin()

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation user={user} isAdmin={isAdmin} />

      <div className="container mx-auto px-4 py-8">
        {/* Приветствие */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Добро пожаловать, {user.email?.split("@")[0]}!</h1>
          <p className="text-xl text-gray-600">Создавайте стильные образы с помощью ИИ</p>
        </div>

        {/* Быстрые действия для обычных пользователей */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-lg">ИИ-стилист</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Получите персональные рекомендации по стилю от искусственного интеллекта
              </p>
              <Button className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Получить совет
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Palette className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-lg">Подбор цветов</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">Найдите идеальные цветовые сочетания для ваших образов</p>
              <Button variant="outline" className="w-full">
                <Palette className="h-4 w-4 mr-2" />
                Подобрать цвета
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="text-lg">Планировщик</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">Планируйте образы на неделю вперед с учетом погоды и событий</p>
              <Button variant="outline" className="w-full">
                <Calendar className="h-4 w-4 mr-2" />
                Открыть планировщик
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Статистика и советы */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Персональные рекомендации */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Персональные рекомендации
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                <h4 className="font-semibold text-blue-900 mb-2">Тренд недели</h4>
                <p className="text-blue-800 text-sm">Минимализм в моде! Попробуйте создать образ в нейтральных тонах</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
                <h4 className="font-semibold text-green-900 mb-2">Совет стилиста</h4>
                <p className="text-green-800 text-sm">
                  Добавьте яркий аксессуар к базовому образу для создания акцента
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border-l-4 border-purple-500">
                <h4 className="font-semibold text-purple-900 mb-2">Погода сегодня</h4>
                <p className="text-purple-800 text-sm">
                  +18°C, переменная облачность. Идеально для легкой куртки или кардигана
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Быстрые действия */}
          <Card>
            <CardHeader>
              <CardTitle>Быстрые действия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <Sparkles className="h-4 w-4 mr-2" />
                Создать образ с помощью ИИ
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Palette className="h-4 w-4 mr-2" />
                Анализ цветотипа
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="h-4 w-4 mr-2" />
                Планировщик на неделю
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <TrendingUp className="h-4 w-4 mr-2" />
                Модные тренды
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
