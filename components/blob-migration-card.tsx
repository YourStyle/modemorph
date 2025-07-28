"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Clock, Database, RefreshCw, Zap } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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

export function BlobMigrationCard() {
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const { toast } = useToast()

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/admin/migrate-blob/status")
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error("Error fetching migration status:", error)
    }
  }

  useEffect(() => {
    fetchStatus()

    // Опрашиваем статус каждую секунду если миграция запущена
    const interval = setInterval(() => {
      if (status?.isRunning) {
        fetchStatus()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [status?.isRunning])

  const startMigration = async (retryOnly = false) => {
    try {
      setIsStarting(true)
      const response = await fetch("/api/admin/migrate-blob", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ retryOnly }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to start migration")
      }

      toast({
        title: retryOnly ? "Повторная миграция запущена" : "Миграция запущена",
        description: retryOnly ? "Повторная обработка неудачных файлов началась" : "Процесс миграции файлов начался",
      })

      // Начинаем опрашивать статус
      setTimeout(fetchStatus, 1000)
    } catch (error) {
      console.error("Error starting migration:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось запустить миграцию",
        variant: "destructive",
      })
    } finally {
      setIsStarting(false)
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}ч ${minutes % 60}м ${seconds % 60}с`
    } else if (minutes > 0) {
      return `${minutes}м ${seconds % 60}с`
    } else {
      return `${seconds}с`
    }
  }

  const getElapsedTime = () => {
    if (!status?.startTime) return "0с"
    return formatTime(Date.now() - status.startTime)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Миграция Blob Storage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-sm text-gray-600">
          Перенос всех медиа файлов из текущего хранилища в новое ModeMorph хранилище
        </div>

        {status && (
          <div className="space-y-4">
            {/* Основной прогресс */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Общий прогресс</span>
                <span className="text-sm text-gray-500">{status.progress}%</span>
              </div>
              <Progress value={status.progress} className="h-2" />
            </div>

            {/* Статистика файлов */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-lg font-bold text-blue-600">{status.totalFiles}</div>
                <div className="text-xs text-blue-600">Всего файлов</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-lg font-bold text-green-600">{status.successfulFiles}</div>
                <div className="text-xs text-green-600">Успешно</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-lg font-bold text-red-600">{status.failedFiles.length}</div>
                <div className="text-xs text-red-600">Ошибки</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-600">{status.skippedFiles}</div>
                <div className="text-xs text-gray-600">Пропущено</div>
              </div>
            </div>

            {/* Категории файлов */}
            {(status.smallFiles > 0 || status.mediumFiles > 0 || status.largeFiles > 0) && (
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-2 bg-green-50 rounded">
                  <div className="text-sm font-bold text-green-600">{status.smallFiles}</div>
                  <div className="text-xs text-green-600">Маленькие (&lt;500KB)</div>
                </div>
                <div className="text-center p-2 bg-yellow-50 rounded">
                  <div className="text-sm font-bold text-yellow-600">{status.mediumFiles}</div>
                  <div className="text-xs text-yellow-600">Средние (500KB-2MB)</div>
                </div>
                <div className="text-center p-2 bg-red-50 rounded">
                  <div className="text-sm font-bold text-red-600">{status.largeFiles}</div>
                  <div className="text-xs text-red-600">Большие (&gt;2MB)</div>
                </div>
              </div>
            )}

            {/* Текущий статус */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {status.isRunning ? (
                  <Clock className="h-4 w-4 text-blue-500 animate-spin" />
                ) : status.completed ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : status.error ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Database className="h-4 w-4 text-gray-500" />
                )}
                <span className="text-sm font-medium">
                  {status.isRunning
                    ? "Выполняется"
                    : status.completed
                      ? "Завершено"
                      : status.error
                        ? "Ошибка"
                        : "Готов к запуску"}
                </span>
                {status.isRunning && (
                  <Badge variant="secondary" className="ml-auto">
                    Батч {status.currentBatch}/{status.totalBatches}
                  </Badge>
                )}
              </div>

              <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{status.currentFile}</div>

              {/* Дополнительная информация */}
              {status.isRunning && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Время: {getElapsedTime()}</span>
                  {status.filesPerMinute > 0 && (
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {status.filesPerMinute} файлов/мин
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Список ошибок */}
            {status.failedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-red-600">Неудачные файлы:</div>
                <div className="max-h-32 overflow-y-auto bg-red-50 p-2 rounded text-xs">
                  {status.failedFiles.map((file, index) => (
                    <div key={index} className="text-red-700 mb-1">
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Кнопки управления */}
        <div className="flex gap-2">
          <Button onClick={() => startMigration(false)} disabled={status?.isRunning || isStarting} className="flex-1">
            {isStarting ? "Запуск..." : "Начать миграцию"}
          </Button>

          {status?.failedFiles && status.failedFiles.length > 0 && !status.isRunning && (
            <Button
              onClick={() => startMigration(true)}
              disabled={isStarting}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Повторить неудачные ({status.failedFiles.length})
            </Button>
          )}
        </div>

        {/* Предупреждение */}
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
          ⚠️ Миграция может занять длительное время в зависимости от количества и размера файлов
        </div>
      </CardContent>
    </Card>
  )
}
