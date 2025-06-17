"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, AlertCircle } from "lucide-react"

interface DiagnosticResult {
  name: string
  status: "success" | "error" | "warning"
  message: string
  details?: string
}

export function SupabaseDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    runDiagnostics()
  }, [])

  const runDiagnostics = async () => {
    const results: DiagnosticResult[] = []

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    results.push({
      name: "Supabase URL",
      status: supabaseUrl ? "success" : "error",
      message: supabaseUrl ? "URL настроен" : "URL не настроен",
      details: supabaseUrl || "Переменная NEXT_PUBLIC_SUPABASE_URL не найдена",
    })

    results.push({
      name: "Supabase Anon Key",
      status: supabaseAnonKey ? "success" : "error",
      message: supabaseAnonKey ? "Ключ настроен" : "Ключ не настроен",
      details: supabaseAnonKey ? "Ключ присутствует" : "Переменная NEXT_PUBLIC_SUPABASE_ANON_KEY не найдена",
    })

    // Test connection
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { data, error } = await supabase.from("wardrobe_items").select("count", { count: "exact", head: true })

        if (error) {
          results.push({
            name: "Подключение к базе данных",
            status: "error",
            message: "Ошибка подключения",
            details: error.message,
          })
        } else {
          results.push({
            name: "Подключение к базе данных",
            status: "success",
            message: "Подключение успешно",
            details: `Найдено записей: ${data?.[0]?.count || 0}`,
          })
        }
      } catch (err) {
        results.push({
          name: "Подключение к базе данных",
          status: "error",
          message: "Ошибка сети",
          details: err instanceof Error ? err.message : "Неизвестная ошибка",
        })
      }

      // Test auth
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          results.push({
            name: "Аутентификация",
            status: "warning",
            message: "Ошибка получения сессии",
            details: error.message,
          })
        } else {
          results.push({
            name: "Аутентификация",
            status: session ? "success" : "warning",
            message: session ? "Пользователь авторизован" : "Пользователь не авторизован",
            details: session ? `Email: ${session.user?.email}` : "Нет активной сессии",
          })
        }
      } catch (err) {
        results.push({
          name: "Аутентификация",
          status: "error",
          message: "Ошибка проверки аутентификации",
          details: err instanceof Error ? err.message : "Неизвестная ошибка",
        })
      }
    }

    setDiagnostics(results)
    setLoading(false)
  }

  const getStatusIcon = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Успешно
          </Badge>
        )
      case "error":
        return <Badge variant="destructive">Ошибка</Badge>
      case "warning":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Предупреждение
          </Badge>
        )
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Диагностика Supabase</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Проверка подключения...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Диагностика Supabase</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {diagnostics.map((result, index) => (
          <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
            {getStatusIcon(result.status)}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{result.name}</h4>
                {getStatusBadge(result.status)}
              </div>
              <p className="text-sm text-gray-600 mt-1">{result.message}</p>
              {result.details && (
                <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-50 p-2 rounded">{result.details}</p>
              )}
            </div>
          </div>
        ))}

        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-800">Инструкции по настройке</h4>
          <ul className="text-sm text-blue-700 mt-2 space-y-1">
            <li>1. Убедитесь, что переменные NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY настроены</li>
            <li>2. Проверьте правильность URL и ключей в настройках проекта Supabase</li>
            <li>3. Убедитесь, что таблицы созданы в базе данных</li>
            <li>4. Проверьте настройки RLS (Row Level Security) в Supabase</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
