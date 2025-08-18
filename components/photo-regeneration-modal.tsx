"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ChevronLeft, ChevronRight, X, Upload, Edit3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PhotoEditor } from "./photo-editor"

interface ExamplePhoto {
  url: string
  type: "good" | "bad"
  title: string
  description: string
}

const EXAMPLE_PHOTOS: ExamplePhoto[] = [
  {
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/telegram-cloud-photo-size-2-5267312561869682094-y.jpg-RkCsRQZwMR6NYupuWj1yrfzUH0xAZY.jpeg",
    type: "good",
    title: "Хорошее фото",
    description: "Четкое изображение на нейтральном фоне, хорошее освещение",
  },
  {
    url: "/placeholder.svg?height=300&width=300",
    type: "bad",
    title: "Плохое фото",
    description: "Размытое изображение, плохое освещение, сложный фон",
  },
  {
    url: "/placeholder.svg?height=300&width=300",
    type: "good",
    title: "Отличное фото",
    description: "Профессиональное фото на белом фоне",
  },
  {
    url: "/placeholder.svg?height=300&width=300",
    type: "bad",
    title: "Неудачное фото",
    description: "Беспорядочный фон, плохой ракурс",
  },
]

interface RegenerationResult {
  imageUrl: string
  item_name: string
  description: string
  material: string
  color: string
  style: string
}

interface PhotoRegenerationModalProps {
  isOpen: boolean
  onClose: () => void
  onRegenerate: (file: File) => Promise<RegenerationResult>
  isFirstTime?: boolean
}

export function PhotoRegenerationModal({
  isOpen,
  onClose,
  onRegenerate,
  isFirstTime = false,
}: PhotoRegenerationModalProps) {
  const [currentStep, setCurrentStep] = useState<"examples" | "upload" | "result" | "editor">("examples")
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerationResult, setRegenerationResult] = useState<RegenerationResult | null>(null)
  const [formData, setFormData] = useState({
    item_name: "",
    description: "",
    material: "",
    color: "",
    style: "",
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleGenerate = async () => {
    if (!selectedFile) return

    setIsRegenerating(true)
    try {
      const result = await onRegenerate(selectedFile)
      setRegenerationResult(result)
      setFormData({
        item_name: result.item_name,
        description: result.description,
        material: result.material,
        color: result.color,
        style: result.style,
      })
      setCurrentStep("result")
    } catch (error) {
      console.error("Regeneration failed:", error)
    } finally {
      setIsRegenerating(false)
    }
  }

  const nextExample = () => {
    setCurrentExampleIndex((prev) => (prev + 1) % EXAMPLE_PHOTOS.length)
  }

  const prevExample = () => {
    setCurrentExampleIndex((prev) => (prev - 1 + EXAMPLE_PHOTOS.length) % EXAMPLE_PHOTOS.length)
  }

  const handleClose = () => {
    setCurrentStep("examples")
    setCurrentExampleIndex(0)
    setSelectedFile(null)
    setRegenerationResult(null)
    setFormData({ item_name: "", description: "", material: "", color: "", style: "" })
    onClose()
  }

  const currentExample = EXAMPLE_PHOTOS[currentExampleIndex]

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden">
        {/* Examples Step */}
        {currentStep === "examples" && (
          <div className="h-full flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Примеры фотографий</h2>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Посмотрите примеры хороших и плохих фотографий для лучшего результата
              </p>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="relative w-full max-w-md">
                <img
                  src={currentExample.url || "/placeholder.svg"}
                  alt={currentExample.title}
                  className="w-full h-80 object-cover rounded-lg"
                />

                <Button
                  variant="outline"
                  size="sm"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-transparent"
                  onClick={prevExample}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent"
                  onClick={nextExample}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <Badge
                  variant={currentExample.type === "good" ? "default" : "destructive"}
                  className="absolute top-2 left-2"
                >
                  {currentExample.type === "good" ? "Хорошо" : "Плохо"}
                </Badge>
              </div>

              <div className="text-center mt-6 max-w-md">
                <h3 className="font-semibold text-lg">{currentExample.title}</h3>
                <p className="text-gray-600 text-sm mt-2">{currentExample.description}</p>
              </div>

              <div className="flex gap-2 mt-4">
                {EXAMPLE_PHOTOS.map((_, index) => (
                  <button
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentExampleIndex ? "bg-blue-500" : "bg-gray-300"
                    }`}
                    onClick={() => setCurrentExampleIndex(index)}
                  />
                ))}
              </div>
            </div>

            <div className="p-6 border-t flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1 bg-transparent">
                Отмена
              </Button>
              <Button onClick={() => setCurrentStep("upload")} className="flex-1">
                Генерация
              </Button>
            </div>
          </div>
        )}

        {/* Upload Step */}
        {currentStep === "upload" && (
          <div className="h-full flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Загрузить фото</h2>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-md">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-sm text-gray-600 mb-4">Выберите фото для улучшения</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="regeneration-file-input"
                  />
                  <Button variant="outline" onClick={() => document.getElementById("regeneration-file-input")?.click()}>
                    Выбрать фото
                  </Button>
                </div>

                {selectedFile && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium">Выбранный файл:</p>
                    <p className="text-sm text-gray-600">{selectedFile.name}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep("examples")} className="flex-1">
                Назад
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedFile || isRegenerating} className="flex-1">
                {isRegenerating ? "Генерация..." : "Сгенерировать"}
              </Button>
            </div>
          </div>
        )}

        {/* Result Step */}
        {currentStep === "result" && regenerationResult && (
          <div className="h-full flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Результат генерации</h2>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="relative">
                    <img
                      src={regenerationResult.imageUrl || "/placeholder.svg"}
                      alt="Результат генерации"
                      className="w-full h-80 object-cover rounded-lg"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setCurrentStep("editor")}
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Редактировать
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="item_name">Название</Label>
                    <Input
                      id="item_name"
                      value={formData.item_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, item_name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Описание</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="material">Материал</Label>
                    <Input
                      id="material"
                      value={formData.material}
                      onChange={(e) => setFormData((prev) => ({ ...prev, material: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="color">Цвет</Label>
                    <Input
                      id="color"
                      value={formData.color}
                      onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="style">Стиль</Label>
                    <Input
                      id="style"
                      value={formData.style}
                      onChange={(e) => setFormData((prev) => ({ ...prev, style: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1 bg-transparent">
                Отмена
              </Button>
              <Button onClick={handleClose} className="flex-1">
                Сохранить
              </Button>
            </div>
          </div>
        )}

        {/* Editor Step */}
        {currentStep === "editor" && regenerationResult && (
          <PhotoEditor
            imageUrl={regenerationResult.imageUrl}
            onSave={(editedImageUrl) => {
              setRegenerationResult((prev) => (prev ? { ...prev, imageUrl: editedImageUrl } : null))
              setCurrentStep("result")
            }}
            onCancel={() => setCurrentStep("result")}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
