"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Clock, Database } from "lucide-react"
import { toast } from "sonner"

interface UrlMigrationStatus {
  isRunning: boolean
  progress: number
  currentTable: string
  totalTables: number
  processedTables: number
  totalUpdates: number
  successfulUpdates: number
  failedUpdates: number
  error: string | null
  completed: boolean
}

export function UrlMigrationCard() {
  const [status, setStatus] = useState<UrlMigrationStatus>({
    isRunning: false,
    progress: 0,
    currentTable: "Готов к запуску",
    totalTables: 0,
    processedTables: 0,
    totalUpdates: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    error: null,
    completed: false,
  })

  const [isLoading, setIsLoading] = useState(false)

  // Получаем статус миграции каждые 2 секунды
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/admin/migrate-urls")
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
        }
      } catch (error) {
        console.error("Error fetching URL migration status:", error)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const startMigration = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/migrate-urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        toast.success("Миграция URL запущена!")
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to start migration")
      }
    } catch (error) {
      console.error("Error starting URL migration:", error)
      toast.error("Ошибка запуска миграции URL")
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = () => {
    if (status.error) return "destructive"
    if (status.completed) return "default"
    if (status.isRunning) return "secondary"
    return "outline"
  }

  const getStatusIcon = () => {
    if (status.error) return <AlertCircle className="h-4 w-4" />
    if (status.completed) return <CheckCircle className="h-4 w-4" />
    if (status.isRunning) return <Clock className="h-4 w-4" />
    return <Database className="h-4 w-4" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Миграция URL в базе данных
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={getStatusColor()}>
              {status.error ? "Ошибка" : status.completed ? "Завершено" : status.isRunning ? "Выполняется" : "Готов"}
            </Badge>
          </div>
          <Button onClick={startMigration} disabled={status.isRunning || isLoading} size="sm">
            {status.isRunning ? "Выполняется..." : "Запустить миграцию URL"}
          </Button>
        </div>

        {status.isRunning && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Прогресс</span>
              <span>{status.progress}%</span>
            </div>
            <Progress value={status.progress} className="w-full" />
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          <p>{status.currentTable}</p>
        </div>

        {(status.totalTables > 0 || status.totalUpdates > 0) && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Таблицы:</span>
                <span>
                  {status.processedTables}/{status.totalTables}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Всего обновлений:</span>
                <span>{status.totalUpdates}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-green-600">
                <span>Успешно:</span>
                <span>{status.successfulUpdates}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Ошибки:</span>
                <span>{status.failedUpdates}</span>
              </div>
            </div>
          </div>
        )}

        {status.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{status.error}</p>
          </div>
        )}

        {status.completed && !status.error && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              Миграция URL завершена успешно! Обновлено {status.successfulUpdates} записей.
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Что делает миграция:</strong>
          </p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Заменяет все blob.vercel-storage.com URL на storage.yandexcloud.net/modemorphs3</li>
            <li>Обрабатывает все таблицы с изображениями</li>
            <li>Сохраняет оригинальную структуру папок и имена файлов</li>
            <li>Обновляет записи в базе данных</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
