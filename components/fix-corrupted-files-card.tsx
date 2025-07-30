"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RefreshCw, FileX, Download, CheckCircle, XCircle, AlertTriangle } from "lucide-react"

interface FixProgress {
  total: number
  processed: number
  corrupted: number
  fixed: number
  failed: number
  errors: string[]
  isRunning: boolean
}

interface CorruptedPreview {
  corruptedCount: number
  totalFiles: number
  examples: Array<{ key: string; size: number }>
}

export function FixCorruptedFilesCard() {
  const [progress, setProgress] = useState<FixProgress>({
    total: 0,
    processed: 0,
    corrupted: 0,
    fixed: 0,
    failed: 0,
    errors: [],
    isRunning: false,
  })
  const [preview, setPreview] = useState<CorruptedPreview | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/admin/fix-corrupted-files")
      const data = await response.json()

      if (data.progress) {
        setProgress(data.progress)
      }

      if (data.preview) {
        setPreview(data.preview)
      }
    } catch (error) {
      console.error("Error fetching status:", error)
    }
  }

  const startFix = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/fix-corrupted-files", {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to start fix")
      }

      // Начинаем опрос статуса
      const interval = setInterval(fetchStatus, 2000)

      // Останавливаем опрос через 10 минут
      setTimeout(() => clearInterval(interval), 600000)
    } catch (error) {
      console.error("Error starting fix:", error)
      alert(`Ошибка запуска: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()

    // Опрашиваем статус каждые 3 секунды если процесс запущен
    const interval = setInterval(() => {
      if (progress.isRunning) {
        fetchStatus()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [progress.isRunning])

  const progressPercentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileX className="h-5 w-5" />
          Исправление поврежденных файлов
        </CardTitle>
        <CardDescription>Поиск и замена файлов размером 75 байт на оригинальные из Vercel Blob</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Превью поврежденных файлов */}
        {preview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{preview.corruptedCount}</div>
              <div className="text-sm text-muted-foreground">Поврежденных файлов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{preview.totalFiles}</div>
              <div className="text-sm text-muted-foreground">Всего файлов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{progress.fixed}</div>
              <div className="text-sm text-muted-foreground">Исправлено</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{progress.failed}</div>
              <div className="text-sm text-muted-foreground">Ошибок</div>
            </div>
          </div>
        )}

        {/* Прогресс исправления */}
        {progress.isRunning && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Прогресс исправления</span>
              <span>
                {progress.processed} / {progress.total}
              </span>
            </div>
            <Progress value={progressPercentage} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progressPercentage.toFixed(1)}% завершено</span>
              <span>
                {progress.total > 0 &&
                  progress.processed > 0 &&
                  `~${Math.round((progress.total - progress.processed) * 2)} сек осталось`}
              </span>
            </div>
          </div>
        )}

        {/* Статистика */}
        {(progress.fixed > 0 || progress.failed > 0) && (
          <div className="flex flex-wrap gap-2">
            {progress.fixed > 0 && (
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                {progress.fixed} исправлено
              </Badge>
            )}
            {progress.failed > 0 && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                {progress.failed} ошибок
              </Badge>
            )}
            {progress.corrupted > 0 && (
              <Badge variant="secondary">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {progress.corrupted} поврежденных
              </Badge>
            )}
          </div>
        )}

        {/* Примеры поврежденных файлов */}
        {preview && preview.examples.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Примеры поврежденных файлов:</h4>
            <div className="space-y-1">
              {preview.examples.map((file, index) => (
                <div key={index} className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  <div className="font-mono">{file.key}</div>
                  <div className="text-red-600">Размер: {file.size} байт</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ошибки */}
        {progress.errors.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <div className="font-medium">Ошибки при исправлении:</div>
                {progress.errors.slice(0, 3).map((error, index) => (
                  <div key={index} className="text-xs">
                    {error}
                  </div>
                ))}
                {progress.errors.length > 3 && (
                  <div className="text-xs">...и еще {progress.errors.length - 3} ошибок</div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Кнопки управления */}
        <div className="flex gap-2">
          <Button onClick={startFix} disabled={loading || progress.isRunning} className="flex-1">
            {loading || progress.isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {progress.isRunning ? "Исправление..." : "Запуск..."}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Исправить поврежденные файлы
              </>
            )}
          </Button>

          <Button variant="outline" onClick={fetchStatus} disabled={loading || progress.isRunning}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Информация о процессе */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Поиск файлов размером 75 байт в Yandex S3</div>
          <div>• Поиск оригинальных файлов в Vercel Blob</div>
          <div>• Замена поврежденных файлов на оригинальные</div>
          <div>• Обработка батчами по 3 файла</div>
        </div>
      </CardContent>
    </Card>
  )
}
