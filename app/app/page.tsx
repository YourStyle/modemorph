"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Sparkles } from "lucide-react"
import { ImageUploadForm } from "@/components/image-upload-form"

export default function AppHomePage() {
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [userName, setUserName] = useState("Антон")

  if (showUploadForm) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-6">
            <Button onClick={() => setShowUploadForm(false)} variant="outline" className="rounded-full">
              ← Назад
            </Button>
          </div>
          <ImageUploadForm />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Заголовок */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Keep Going, {userName}</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Добавьте ваши вещи, чтобы получать персонализированные ежедневные образы из вашего гардероба
          </p>
        </div>

        {/* 3D Гардероб */}
        <div className="flex justify-center mb-12">
          <div className="relative">
            <div className="w-80 h-80 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl shadow-2xl flex items-center justify-center overflow-hidden">
              <div className="relative w-64 h-64">
                {/* Имитация 3D гардероба */}
                <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-gray-100 rounded-2xl shadow-inner">
                  <div className="absolute top-4 left-4 right-4 h-2 bg-gray-300 rounded-full"></div>

                  {/* Вешалки с одеждой */}
                  <div className="absolute top-8 left-6 right-6 flex justify-between">
                    <div className="w-8 h-24 bg-gradient-to-b from-green-200 to-green-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-20 bg-gradient-to-b from-blue-200 to-blue-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-28 bg-gradient-to-b from-yellow-200 to-yellow-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-22 bg-gradient-to-b from-pink-200 to-pink-300 rounded-lg shadow-sm"></div>
                    <div className="w-8 h-26 bg-gradient-to-b from-purple-200 to-purple-300 rounded-lg shadow-sm"></div>
                  </div>

                  {/* Полки снизу */}
                  <div className="absolute bottom-8 left-6 right-6">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded shadow-sm flex items-center justify-center">
                        <div className="w-4 h-4 bg-blue-400 rounded"></div>
                      </div>
                      <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded shadow-sm flex items-center justify-center">
                        <div className="w-6 h-3 bg-white rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Секция добавления */}
        <Card className="border-0 shadow-xl rounded-3xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
          <CardContent className="p-8 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 text-white/80 text-sm mb-2">
                <span>Гардероб</span>
                <span className="bg-white/20 px-2 py-1 rounded-full text-xs">2/5</span>
              </div>
            </div>

            <Button
              onClick={() => setShowUploadForm(true)}
              className="w-full max-w-md bg-white text-gray-900 hover:bg-gray-100 rounded-full py-4 text-lg font-semibold shadow-lg transition-all duration-200 hover:shadow-xl"
            >
              <Plus className="h-5 w-5 mr-2" />
              Добавить в гардероб
            </Button>

            <div className="mt-6 text-center">
              <p className="text-white/60 text-sm mb-2">Не знаете, с чего начать?</p>
              <Button variant="link" className="text-blue-400 hover:text-blue-300 p-0 h-auto font-medium">
                <Sparkles className="h-4 w-4 mr-1" />
                Получить стиль от ИИ
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
