"use client"

import { AIAssistantLoader } from "@/components/ai-assistant-loader"
import { Card } from "@/components/ui/card"

export default function AIAssistantPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ИИ-Ассистент</h1>
          <p className="text-gray-600 text-sm">Ваш персональный стилист готов помочь</p>
        </div>

        <div className="flex justify-center mb-8">
          <Card className="p-8 bg-gradient-to-br from-gray-100 to-gray-200 border-0 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <AIAssistantLoader size={120} />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-800 mb-1">ИИ</h3>
                <p className="text-sm text-gray-600">Анализирую ваш стиль...</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 bg-white border border-gray-200">
            <h4 className="font-medium text-gray-900 mb-2">Рекомендации дня</h4>
            <p className="text-sm text-gray-600">Сегодня отличная погода для легкого пальто и удобной обуви</p>
          </Card>

          <Card className="p-4 bg-white border border-gray-200">
            <h4 className="font-medium text-gray-900 mb-2">Анализ гардероба</h4>
            <p className="text-sm text-gray-600">В вашем гардеробе не хватает базовых вещей нейтральных тонов</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
