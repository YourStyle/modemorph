import { createClient } from "@/lib/supabase/server"
import { ImageUploadForm } from "@/components/image-upload-form"
import { Sparkles, Palette, Calendar, Zap, Eye, CalendarDays } from "lucide-react"

export default async function AppPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 space-y-8">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Добро пожаловать в ваш цифровой гардероб!</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Загрузите фотографию вашего образа, и наш ИИ автоматически определит все вещи и добавит их в ваш гардероб.
          </p>
        </div>

        {/* Image Upload Form */}
        <div className="mb-12">
          <ImageUploadForm />
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* AI Stylist */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Sparkles className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">ИИ-стилист</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Получите персональные рекомендации по стилю от искусственного интеллекта
            </p>
            <button className="w-full bg-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" />
              Получить совет
            </button>
          </div>

          {/* Color Picker */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Palette className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Подбор цветов</h3>
            </div>
            <p className="text-gray-600 mb-4">Найдите идеальные цветовые сочетания для ваших образов</p>
            <button className="w-full bg-white text-gray-900 py-3 px-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <Palette className="h-4 w-4" />
              Подобрать цвета
            </button>
          </div>

          {/* Planner */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Планировщик</h3>
            </div>
            <p className="text-gray-600 mb-4">Планируйте образы на неделю вперед с учетом погоды и событий</p>
            <button className="w-full bg-white text-gray-900 py-3 px-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <Calendar className="h-4 w-4" />
              Открыть планировщик
            </button>
          </div>
        </div>

        {/* Bottom Sections */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Personal Recommendations */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="h-6 w-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-gray-900">Персональные рекомендации</h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                <h4 className="font-semibold text-blue-900 mb-1">Тренд недели</h4>
                <p className="text-blue-800 text-sm">Минимализм в моде! Попробуйте создать образ в нейтральных тонах</p>
              </div>

              <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-400">
                <h4 className="font-semibold text-green-900 mb-1">Совет стилиста</h4>
                <p className="text-green-800 text-sm">
                  Добавьте яркий аксессуар к базовому образу для создания акцента
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Быстрые действия</h2>

            <div className="space-y-3">
              <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
                <Zap className="h-5 w-5 text-yellow-600" />
                <span className="font-medium">Создать образ с помощью ИИ</span>
              </button>

              <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
                <Eye className="h-5 w-5 text-blue-600" />
                <span className="font-medium">Анализ цветотипа</span>
              </button>

              <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
                <CalendarDays className="h-5 w-5 text-purple-600" />
                <span className="font-medium">Планировщик на неделю</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
