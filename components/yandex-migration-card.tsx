"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { RefreshCw, Upload, AlertCircle, CheckCircle, Clock, Files } from "lucide-react"

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

  const [isStarting, setIsStarting] = useState(false)

  // Обновляем статус каждые 2 секунды
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/admin/migrate-to-yandex")
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
        }
      } catch (error) {
        console.error("Error fetching migration status:", error)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const startMigration = async (retryFailed = false) => {
    setIsStarting(true)
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
      setIsStarting(false)
    }
  }

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return "N/A"
    const elapsed = Date.now() - timestamp
    const minutes = Math.floor(elapsed / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Миграция в Yandex S3
        </CardTitle>
        <CardDescription>Перенос всех изображений из Vercel Blob в Yandex S3 для доступности из России</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Статус миграции */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Прогресс миграции</span>
            <span className="text-sm text-muted-foreground">{status.progress}%</span>
          </div>
          <Progress value={status.progress} className="w-full" />
          <p className="text-sm text-muted-foreground">{status.currentFile}</p>
        </div>

        {/* Статистика */}
        {status.totalFiles > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{status.totalFiles}</div>
              <div className="text-xs text-muted-foreground">Всего файлов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{status.successfulFiles}</div>
              <div className="text-xs text-muted-foreground">Успешно</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{status.failedFiles.length}</div>
              <div className="text-xs text-muted-foreground">Ошибки</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{status.filesPerMinute}</div>
              <div className="text-xs text-muted-foreground">файлов/мин</div>
            </div>
          </div>
        )}

        {/* Категории файлов */}
        {(status.smallFiles > 0 || status.mediumFiles > 0 || status.largeFiles > 0) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Files className="h-4 w-4" />
              Категории файлов
            </h4>
            <div className="flex gap-2 flex-wrap">
              {status.smallFiles > 0 && <Badge variant="secondary">Маленькие: {status.smallFiles}</Badge>}
              {status.mediumFiles > 0 && <Badge variant="secondary">Средние: {status.mediumFiles}</Badge>}
              {status.largeFiles > 0 && <Badge variant="secondary">Большие: {status.largeFiles}</Badge>}
            </div>
          </div>
        )}

        {/* Информация о времени */}
        {status.startTime && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Время: {formatTime(status.startTime)}
            </div>
            {status.totalBatches > 0 && (
              <div>
                Батч: {status.currentBatch}/{status.totalBatches}
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* Ошибки */}
        {status.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        )}

        {/* Неудачные файлы */}
        {status.failedFiles.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>Файлы с ошибками ({status.failedFiles.length}):</p>
                <div className="max-h-32 overflow-y-auto text-xs">
                  {status.failedFiles.slice(0, 5).map((file, index) => (
                    <div key={index} className="truncate">
                      {file}
                    </div>
                  ))}
                  {status.failedFiles.length > 5 && (
                    <div className="text-muted-foreground">... и еще {status.failedFiles.length - 5} файлов</div>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Успешное завершение */}
        {status.completed && !status.error && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Миграция успешно завершена! Перенесено {status.successfulFiles} из {status.totalFiles} файлов.
            </AlertDescription>
          </Alert>
        )}

        {/* Кнопки управления */}
        <div className="flex gap-2">
          <Button onClick={() => startMigration(false)} disabled={status.isRunning || isStarting} className="flex-1">
            {isStarting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Запуск...
              </>
            ) : status.isRunning ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Выполняется...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Начать миграцию
              </>
            )}
          </Button>

          {status.failedFiles.length > 0 && !status.isRunning && (
            <Button onClick={() => startMigration(true)} disabled={isStarting} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Повторить ошибки
            </Button>
          )}
        </div>

        {/* Предупреждение */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Внимание:</strong> Миграция может занять длительное время в зависимости от количества файлов.
            Процесс выполняется в фоновом режиме.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
