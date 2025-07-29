"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { RefreshCw, Upload, AlertCircle, CheckCircle, Clock, Database } from "lucide-react"

interface MigrationStatus {
  isRunning: boolean
  progress: number
  currentFile: string
  totalFiles: number
  processedFiles: number
  successfulFiles: number
  failedFiles: string[]
  skippedFiles: number
  error: string | null
  completed: boolean
  startTime: number | null
  currentBatch: number
  totalBatches: number
  filesPerMinute: number
  smallFiles: number
  mediumFiles: number
  largeFiles: number
}

export function YandexMigrationCard() {
  const [status, setStatus] = useState<MigrationStatus>({
    isRunning: false,
    progress: 0,
    currentFile: "Готов к запуску",
    totalFiles: 0,
    processedFiles: 0,
    successfulFiles: 0,
    failedFiles: [],
    skippedFiles: 0,
    error: null,
    completed: false,
    startTime: null,
    currentBatch: 0,
    totalBatches: 0,
    filesPerMinute: 0,
    smallFiles: 0,
    mediumFiles: 0,
    largeFiles: 0,
  })

  const [isLoading, setIsLoading] = useState(false)

  // Получаем статус миграции каждые 2 секунды
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/admin/migrate-to-yandex")
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
        }
      } catch (error) {
        console.error("Error fetching migration status:", error)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)

    return () => clearInterval(interval)
  }, [])

  const startMigration = async (retryFailed = false) => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/migrate-to-yandex", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ retryFailed }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to start migration")
      }

      console.log("Migration started successfully")
    } catch (error) {
      console.error("Error starting Yandex migration:", error)
      alert(`Ошибка запуска миграции: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return "—"
    const elapsed = Date.now() - timestamp
    const minutes = Math.floor(elapsed / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
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
    if (status.isRunning) return <RefreshCw className="h-4 w-4 animate-spin" />
    return <Upload className="h-4 w-4" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Миграция в Yandex S3
        </CardTitle>
        <CardDescription>
          Перенос всех изображений из Vercel Blob в Yandex S3 хранилище для доступности из России
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Статус миграции */}
        <div className="flex items-center justify-between">
          <Badge variant={getStatusColor()} className="flex items-center gap-1">
            {getStatusIcon()}
            {status.isRunning ? "Выполняется" : status.completed ? "Завершено" : status.error ? "Ошибка" : "Готов"}
          </Badge>
          {status.startTime && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTime(status.startTime)}
            </div>
          )}
        </div>

        {/* Прогресс-бар */}
        {status.totalFiles > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Прогресс миграции</span>
              <span>{status.progress}%</span>
            </div>
            <Progress value={status.progress} className="w-full" />
            <div className="text-xs text-muted-foreground">
              {status.processedFiles} из {status.totalFiles} файлов обработано
            </div>
          </div>
        )}

        {/* Текущий файл */}
        {status.currentFile && (
          <div className="text-sm">
            <span className="font-medium">Текущий статус:</span>
            <div className="text-muted-foreground mt-1 break-all">{status.currentFile}</div>
          </div>
        )}

        {/* Статистика по категориям файлов */}
        {(status.smallFiles > 0 || status.mediumFiles > 0 || status.largeFiles > 0) && (
          <div className="space-y-2">
            <Separator />
            <div className="text-sm font-medium">Категории файлов:</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded">
                <div className="font-medium text-green-700">Маленькие</div>
                <div className="text-green-600">&lt; 500KB</div>
                <div className="font-bold text-green-800">{status.smallFiles}</div>
              </div>
              <div className="text-center p-2 bg-yellow-50 rounded">
                <div className="font-medium text-yellow-700">Средние</div>
                <div className="text-yellow-600">500KB - 2MB</div>
                <div className="font-bold text-yellow-800">{status.mediumFiles}</div>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <div className="font-medium text-red-700">Большие</div>
                <div className="text-red-600">&gt; 2MB</div>
                <div className="font-bold text-red-800">{status.largeFiles}</div>
              </div>
            </div>
          </div>
        )}

        {/* Статистика обработки */}
        {status.totalFiles > 0 && (
          <div className="space-y-2">
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-green-600">Успешно:</span>
                <span className="ml-2">{status.successfulFiles}</span>
              </div>
              <div>
                <span className="font-medium text-red-600">Ошибки:</span>
                <span className="ml-2">{status.failedFiles.length}</span>
              </div>
              <div>
                <span className="font-medium text-blue-600">Батчи:</span>
                <span className="ml-2">
                  {status.currentBatch}/{status.totalBatches}
                </span>
              </div>
              <div>
                <span className="font-medium text-purple-600">Скорость:</span>
                <span className="ml-2">{status.filesPerMinute} файлов/мин</span>
              </div>
            </div>
          </div>
        )}

        {/* Ошибка */}
        {status.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        )}

        {/* Неудачные файлы */}
        {status.failedFiles.length > 0 && (
          <div className="space-y-2">
            <Separator />
            <div className="text-sm font-medium text-red-600">Неудачные файлы ({status.failedFiles.length}):</div>
            <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1">
              {status.failedFiles.slice(0, 10).map((file, index) => (
                <div key={index} className="break-all">
                  {file}
                </div>
              ))}
              {status.failedFiles.length > 10 && (
                <div className="text-center text-muted-foreground">
                  ... и еще {status.failedFiles.length - 10} файлов
                </div>
              )}
            </div>
          </div>
        )}

        {/* Кнопки управления */}
        <div className="flex gap-2 pt-2">
          <Button onClick={() => startMigration(false)} disabled={status.isRunning || isLoading} className="flex-1">
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {status.isRunning ? "Миграция выполняется..." : "Начать миграцию"}
          </Button>

          {status.failedFiles.length > 0 && !status.isRunning && (
            <Button onClick={() => startMigration(true)} disabled={isLoading} variant="outline" className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Повторить неудачные ({status.failedFiles.length})
            </Button>
          )}
        </div>

        {/* Информация */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Файлы обрабатываются батчами для оптимальной производительности</div>
          <div>• Оригинальная структура папок сохраняется</div>
          <div>• URL в базе данных автоматически обновляются</div>
          <div>• Поиск выполняется по всем таблицам и колонкам</div>
        </div>
      </CardContent>
    </Card>
  )
}
