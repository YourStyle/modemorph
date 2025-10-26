"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Wifi, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isChecking, setIsChecking] = useState(false)
  const router = useRouter()

  useEffect(() => {
    console.error("Page error (client):", {
      message: error.message,
      digest: (error as any).digest,
    })
  }, [error])

  const handleGoToApp = async () => {
    setIsChecking(true)

    try {
      const response = await fetch("/api/me/profile")
      const profile = await response.json()

      if (profile && profile !== null) {
        router.push("/app")
      } else {
        // Если профиль пустой, показываем ошибку
        alert("Профиль не найден. Попробуйте войти в систему заново.")
      }
    } catch (err) {
      console.error("Ошибка при проверке профиля:", err)
      alert("Ошибка при проверке профиля. Проверьте подключение к интернету.")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white border-0 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-serif font-bold text-gray-900">Возникла ошибка</CardTitle>
          <CardDescription className="text-gray-600 mt-2">При выполнении операции произошла ошибка</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-blue-800 mb-2">Если ошибка повторится</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Напишите в поддержку, указав что вы пытались сделать в момент возникновения ошибки.
                </p>
                <p className="text-sm text-blue-700 font-medium">
                  При подтверждении ошибки мы начислим вам месяц подписки бесплатно.
                </p>
              </div>
            </div>
          </div>

          {/* Информация об ошибке */}
          {(error as any).digest && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-mono">Код ошибки: {(error as any).digest}</p>
            </div>
          )}

          {/* Кнопки действий */}
          <div className="space-y-3">
            <Button
              onClick={handleGoToApp}
              disabled={isChecking}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-2xl py-3 h-auto"
            >
              {isChecking ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Проверка...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span>В приложение</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </Button>

            <Button
              onClick={reset}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 rounded-2xl py-3 h-auto bg-transparent"
            >
              <div className="flex items-center space-x-2">
                <Wifi className="w-4 h-4" />
                <span>Повторить попытку</span>
              </div>
            </Button>
          </div>

          {/* Дополнительная помощь */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Если проблема повторяется, попробуйте обновить страницу или проверьте подключение к интернету
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
