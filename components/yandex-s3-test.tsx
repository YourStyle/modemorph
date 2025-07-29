"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, List, Trash2, Download, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface S3File {
  key: string
  size: number
  lastModified: Date
}

export function YandexS3Test() {
  const [files, setFiles] = useState<S3File[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Загрузка файла
  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error("Выберите файл для загрузки")
      return
    }

    // Проверяем размер файла
    if (uploadFile.size > 10 * 1024 * 1024) {
      toast.error("Файл слишком большой (максимум 10MB)")
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log("Starting upload for file:", {
        name: uploadFile.name,
        size: uploadFile.size,
        type: uploadFile.type,
      })

      const formData = new FormData()
      formData.append("file", uploadFile)
      formData.append("prefix", "test")

      console.log("FormData created, making request...")

      const response = await fetch("/api/upload-to-yandex", {
        method: "POST",
        body: formData,
      })

      console.log("Response received:", response.status, response.statusText)

      const result = await response.json()
      console.log("Response data:", result)

      if (result.success) {
        toast.success("Файл успешно загружен!")
        console.log("Uploaded file URL:", result.url)
        setUploadFile(null)
        // Сбрасываем input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        if (fileInput) fileInput.value = ""
        loadFiles() // Обновляем список файлов
      } else {
        const errorMsg = result.error || "Неизвестная ошибка"
        setError(errorMsg)
        toast.error(`Ошибка загрузки: ${errorMsg}`)
        console.error("Upload error details:", result)
      }
    } catch (error) {
      console.error("Upload error:", error)
      const errorMsg = error instanceof Error ? error.message : "Ошибка при загрузке файла"
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Получение списка файлов
  const loadFiles = async () => {
    setLoading(true)
    setError(null)

    try {
      console.log("Loading files list...")

      const response = await fetch("/api/yandex-s3/list?prefix=test")
      const result = await response.json()

      console.log("Files list response:", result)

      if (result.success) {
        setFiles(result.files || [])
        toast.success(`Загружено ${result.files?.length || 0} файлов`)
      } else {
        const errorMsg = result.error || "Неизвестная ошибка"
        setError(errorMsg)
        toast.error(`Ошибка получения списка: ${errorMsg}`)
        console.error("List error details:", result)
      }
    } catch (error) {
      console.error("List error:", error)
      const errorMsg = error instanceof Error ? error.message : "Ошибка при получении списка файлов"
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Удаление файла
  const deleteFile = async (key: string) => {
    setLoading(true)
    setError(null)

    try {
      console.log("Deleting file:", key)

      const response = await fetch(`/api/yandex-s3/delete?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      })

      const result = await response.json()

      console.log("Delete response:", result)

      if (result.success) {
        toast.success("Файл удален")
        loadFiles() // Обновляем список файлов
      } else {
        const errorMsg = result.error || "Неизвестная ошибка"
        setError(errorMsg)
        toast.error(`Ошибка удаления: ${errorMsg}`)
        console.error("Delete error details:", result)
      }
    } catch (error) {
      console.error("Delete error:", error)
      const errorMsg = error instanceof Error ? error.message : "Ошибка при удалении файла"
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Тестирование Yandex Cloud Object Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Показываем ошибки */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Ошибка:</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Загрузка файла */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Загрузить файл (максимум 10MB)</label>
            <div className="flex gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  console.log("File selected:", file ? { name: file.name, size: file.size, type: file.type } : null)
                  setUploadFile(file)
                  setError(null) // Сбрасываем ошибку при выборе нового файла
                }}
                className="flex-1"
                disabled={loading}
              />
              <Button onClick={handleUpload} disabled={loading || !uploadFile} className="shrink-0">
                {loading ? "Загрузка..." : "Загрузить"}
              </Button>
            </div>
            {uploadFile && (
              <div className="text-sm text-gray-600 space-y-1">
                <p>Выбран файл: {uploadFile.name}</p>
                <p>Размер: {formatFileSize(uploadFile.size)}</p>
                <p>Тип: {uploadFile.type}</p>
              </div>
            )}
          </div>

          {/* Список файлов */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Файлы в хранилище</label>
              <Button onClick={loadFiles} disabled={loading} variant="outline" size="sm">
                <List className="h-4 w-4 mr-2" />
                {loading ? "Загрузка..." : "Обновить"}
              </Button>
            </div>

            {files.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {files.map((file) => (
                  <div key={file.key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.key}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {formatFileSize(file.size)}
                        </Badge>
                        <span className="text-xs text-gray-500">{new Date(file.lastModified).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const url = `https://storage.yandexcloud.net/modemorphs3/${file.key}`
                          console.log("Opening file URL:", url)
                          window.open(url, "_blank")
                        }}
                        disabled={loading}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteFile(file.key)} disabled={loading}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                Файлы не найдены. Загрузите файл или нажмите "Обновить"
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Информация о конфигурации */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Конфигурация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-medium">Хост:</span>
              <p className="text-gray-600">storage.yandexcloud.net</p>
            </div>
            <div>
              <span className="font-medium">Бакет:</span>
              <p className="text-gray-600">modemorphs3</p>
            </div>
            <div>
              <span className="font-medium">Регион:</span>
              <p className="text-gray-600">ru-central1</p>
            </div>
            <div>
              <span className="font-medium">Подпись:</span>
              <p className="text-gray-600">AWS Signature Version 4</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
