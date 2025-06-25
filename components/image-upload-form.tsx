"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, ImageIcon, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function ImageUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const { toast } = useToast()

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive",
      })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 10MB",
        variant: "destructive",
      })
      return
    }

    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("image", selectedFile)

      const response = await fetch(
        "https://primary-production-84ad.up.railway.app/webhook-test/eb22a974-7fdf-4038-b21b-132697314679",
        {
          method: "POST",
          body: formData,
        },
      )

      if (response.ok) {
        toast({
          title: "Успешно!",
          description: "Изображение отправлено для обработки",
        })
        removeFile()
      } else {
        throw new Error("Ошибка отправки")
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось отправить изображение",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-indigo-900">
          <Upload className="h-5 w-5" />
          Загрузить фото для анализа
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="border-2 border-dashed border-indigo-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl || "/placeholder.svg"}
                alt="Preview"
                className="max-w-full max-h-48 mx-auto rounded-lg object-contain"
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile()
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <ImageIcon className="h-12 w-12 mx-auto text-indigo-400" />
              <p className="text-indigo-700">Перетащите изображение сюда или нажмите для выбора</p>
              <p className="text-sm text-indigo-500">Поддерживаются JPG, PNG, WebP до 10MB</p>
            </div>
          )}
        </div>

        <input id="file-input" type="file" accept="image/*" onChange={handleFileInput} className="hidden" />

        <Button
          onClick={handleSubmit}
          disabled={!selectedFile || isUploading}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
        >
          {isUploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Отправляем...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Переложить вещи в гардероб
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
