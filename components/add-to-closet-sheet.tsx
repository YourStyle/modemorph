"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { PhotoAnalysisForm } from "./photo-analysis-form"
import { CommonSheet } from "@/components/common-sheet"

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

interface AddToClosetSheetProps {
  isOpen: boolean
  onClose: () => void
  initialPhotos?: UploadedPhoto[]
}

export function AddToClosetSheet({ isOpen, onClose, initialPhotos = [] }: AddToClosetSheetProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedPhoto[]>([])
  const [showAnalysisForm, setShowAnalysisForm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const newPhotos: UploadedPhoto[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
    }))

    setSelectedFiles(newPhotos)
    setShowAnalysisForm(true)

    // Очищаем input для возможности повторного выбора тех же файлов
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handlePhotoUpload = () => {
    fileInputRef.current?.click()
  }

  const handleSuccess = () => {
    onClose()
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const handleReset = () => {
    // Освобождаем URL объекты
    selectedFiles.forEach((photo) => {
      URL.revokeObjectURL(photo.preview)
    })
    setSelectedFiles([])
    setShowAnalysisForm(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Если есть начальные фото или показываем форму анализа
  if (showAnalysisForm || (initialPhotos && initialPhotos.length > 0)) {
    return (
      <CommonSheet isOpen={isOpen} onClose={handleClose}>
        <div className="h-[calc(90vh-120px)] overflow-hidden">
          <PhotoAnalysisForm
            initialPhotos={selectedFiles.length > 0 ? selectedFiles : initialPhotos}
            onSuccess={handleSuccess}
            onReset={handleReset}
          />
        </div>
      </CommonSheet>
    )
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose}>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2 text-white">Добавить в гардероб</h2>
        <p className="text-gray-400 text-sm">
          Персонализируйте свои будущие образы и узнайте, как стилизовать вещи из гардероба
        </p>
      </div>

      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/heic,image/jpeg,image/jpg,image/webp,image/png"
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        <Button
          onClick={handlePhotoUpload}
          className="w-full bg-white text-gray-900 hover:bg-gray-100 h-14 rounded-2xl text-base font-medium"
        >
          <Camera className="w-5 h-5 mr-3" />
          Найти вещи на фото
        </Button>
      </div>
    </CommonSheet>
  )
}
