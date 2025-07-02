"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, X, Camera, ImageIcon } from "lucide-react"
import { PastelLoader } from "./pastel-loader"

interface ImageUploadFormProps {
  onSuccess?: () => void
}

export function ImageUploadForm({ onSuccess }: ImageUploadFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState("")
  const [material, setMaterial] = useState("")
  const [color, setColor] = useState("")
  const [notes, setNotes] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newFiles = Array.from(files).slice(0, 5 - selectedFiles.length)
    const newPreviews: string[] = []

    newFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          newPreviews.push(e.target.result as string)
          if (newPreviews.length === newFiles.length) {
            setPreviews((prev) => [...prev, ...newPreviews])
          }
        }
      }
      reader.readAsDataURL(file)
    })

    setSelectedFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return

    setIsUploading(true)

    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => {
        formData.append("files", file)
      })
      formData.append("itemName", itemName)
      formData.append("category", category)
      formData.append("material", material)
      formData.append("color", color)
      formData.append("notes", notes)

      const response = await fetch("/api/wardrobe/add", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        // Reset form
        setSelectedFiles([])
        setPreviews([])
        setItemName("")
        setCategory("")
        setMaterial("")
        setColor("")
        setNotes("")
        onSuccess?.()
      } else {
        console.error("Upload failed")
      }
    } catch (error) {
      console.error("Error uploading:", error)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload Area */}
        <Card className="border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors">
          <CardContent className="p-8">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                  <Camera className="w-8 h-8 text-gray-600" />
                </div>
              </div>
              <h3 className="text-lg font-serif font-semibold text-gray-900 mb-2">Добавьте фотографии вещей</h3>
              <p className="text-gray-600 mb-6">Загрузите до 5 фотографий. ИИ автоматически определит детали.</p>

              <div className="flex gap-4 justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  Выбрать файлы
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>

        {/* Preview Images */}
        {previews.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {previews.map((preview, index) => (
              <div key={index} className="relative group">
                <img
                  src={preview || "/placeholder.svg"}
                  alt={`Preview ${index + 1}`}
                  className="w-full aspect-square object-cover rounded-lg"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFile(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="itemName">Название вещи</Label>
            <Input
              id="itemName"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Например: Синяя рубашка"
            />
          </div>

          <div>
            <Label htmlFor="category">Категория</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outerwear">Верхняя одежда</SelectItem>
                <SelectItem value="pants">Брюки</SelectItem>
                <SelectItem value="shoes">Обувь</SelectItem>
                <SelectItem value="dresses">Платья</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="material">Материал</Label>
            <Input
              id="material"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="Например: Хлопок, Шерсть"
            />
          </div>

          <div>
            <Label htmlFor="color">Цвет</Label>
            <Input
              id="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Например: Синий, Красный"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Заметки</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Дополнительные детали о вещи..."
            rows={3}
          />
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={selectedFiles.length === 0 || isUploading}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3"
        >
          {isUploading ? (
            <div className="flex items-center gap-2">
              <PastelLoader size={20} />
              Обработка...
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Добавить в гардероб ({selectedFiles.length})
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
