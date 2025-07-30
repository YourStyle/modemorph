"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Clock, Upload, RotateCcw } from "lucide-react"
import { toast } from "sonner"

interface YandexMigrationStatus {
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
  const [status, setStatus] = useState<YandexMigrationStatus>({
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
  const [shouldPoll, setShouldPoll] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/migrate-to-yandex")
      if (response.ok) {
        const data = await response.json()
        setStatus(data)

        // Останавливаем опрос если процесс не запущен
        if (!data.isRunning) {
          setShouldPoll(false)
        }
      }
    } catch (error) {
      console.error("Error fetching migration status:", error)
      setShouldPoll(false)
    }
  }, [])

  // Опрашиваем статус только когда процесс запущен
  useEffect(() => {
    if (!shouldPoll) return

    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [shouldPoll, fetchStatus])

  // Загружаем начальный статус только один раз
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

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

      if (response.ok) {
        toast.success(retryFailed ? "Повторная миграция запущена!" : "Миграция в Yandex S3 запущена!")
        setShouldPoll(true) // Начинаем опрос
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to start migration")
      }
    } catch (error) {
      console.error("Error starting Yandex migration:", error)
      toast.error("Ошибка запуска миграции")
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
    return <Upload className="h-4 w-4" />
  }

  const formatTime = (minutes: number) => {
    if (minutes < 1) return "< 1 мин"
    if (minutes < 60) return `${Math.round(minutes)} мин`
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours}ч ${mins}м`
  }

  const getEstimatedTimeRemaining = () => {
    if (!status.startTime || !status.filesPerMinute || status.filesPerMinute === 0) return null
    const remainingFiles = status.totalFiles - status.processedFiles
    const remainingMinutes = remainingFiles / status.filesPerMinute
    return formatTime(remainingMinutes)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Миграция файлов в Yandex S3
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
          <div className="flex gap-2">
            {status.failedFiles.length > 0 && !status.isRunning && (
              <Button onClick={() => startMigration(true)} disabled={isLoading} size="sm" variant="outline">
                <RotateCcw className="h-4 w-4 mr-1" />
                Повторить ({status.failedFiles.length})
              </Button>
            )}
            <Button onClick={() => startMigration(false)} disabled={status.isRunning || isLoading} size="sm">
              {status.isRunning ? "Выполняется..." : "Запустить миграцию"}
            </Button>
          </div>
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
          <p>{status.currentFile}</p>
        </div>

        {(status.totalFiles > 0 || status.currentBatch > 0) && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Файлы:</span>
                <span>
                  {status.processedFiles}/{status.totalFiles}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Батчи:</span>
                <span>
                  {status.currentBatch}/{status.totalBatches}
                </span>
              </div>
              {status.filesPerMinute > 0 && (
                <div className="flex justify-between">
                  <span>Скорость:</span>
                  <span>{status.filesPerMinute} файлов/мин</span>
                </div>
              )}
              {getEstimatedTimeRemaining() && (
                <div className="flex justify-between">
                  <span>Осталось:</span>
                  <span>{getEstimatedTimeRemaining()}</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-green-600">
                <span>Успешно:</span>
                <span>{status.successfulFiles}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Ошибки:</span>
                <span>{status.failedFiles.length}</span>
              </div>
              {status.skippedFiles > 0 && (
                <div className="flex justify-between text-yellow-600">
                  <span>Пропущено:</span>
                  <span>{status.skippedFiles}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {status.failedFiles.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800 mb-2">Неудачные файлы ({status.failedFiles.length}):</p>
            <div className="max-h-32 overflow-y-auto">
              {status.failedFiles.slice(0, 5).map((file, index) => (
                <p key={index} className="text-xs text-red-700 truncate">
                  {file}
                </p>
              ))}
              {status.failedFiles.length > 5 && (
                <p className="text-xs text-red-600 mt-1">... и еще {status.failedFiles.length - 5} файлов</p>
              )}
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
              Миграция завершена успешно! Перенесено {status.successfulFiles} из {status.totalFiles} файлов.
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Что делает миграция:</strong>
          </p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Находит все изображения в Vercel Blob Storage</li>
            <li>Загружает их в Yandex S3 (storage.yandexcloud.net/modemorphs3)</li>
            <li>Обновляет URL в базе данных</li>
            <li>Сохраняет оригинальную структуру папок</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
