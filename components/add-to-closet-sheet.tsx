"use client"

import type React from "react"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { PhotoAnalysisForm } from "./photo-analysis-form"
import { CommonSheet } from "@/components/common-sheet"

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

type AnalysisSuccessPayload = {
  items: any[]
  photos: UploadedPhoto[]
  analysisResults: { success: boolean; items: any[] }[]
}

interface AddToClosetSheetProps {
  isOpen: boolean
  onClose: () => void
  initialPhotos?: UploadedPhoto[]
  /** новый колбэк: отдадим результат анализа наверх (не закрываем шторку автоматически) */
  onAnalysisSuccess?: (payload: AnalysisSuccessPayload & { batchId: string }) => void
}

export function AddToClosetSheet({
  isOpen,
  onClose,
  initialPhotos = [],
  onAnalysisSuccess,
}: AddToClosetSheetProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedPhoto[]>([])
  const [showAnalysisForm, setShowAnalysisForm] = useState(false)
  const batchIdRef = useRef<string>("")

  // генерируем batchId при каждом открытии
  useEffect(() => {
    if (isOpen) {
      batchIdRef.current = crypto.randomUUID()
    } else {
      batchIdRef.current = ""
    }
  }, [isOpen])

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
  }

  const handlePhotoUpload = () => {
    const fileInput = document.createElement("input")
    fileInput.type = "file"
    fileInput.accept = "image/heic,image/jpeg,image/jpg,image/webp,image/png"
    fileInput.multiple = true
    fileInput.onchange = handleFileSelect
    fileInput.click()
  }

  // ⚠️ Больше НЕ закрываем шторку по успешному анализу — отдаём данные наверх, пусть родитель решит.
  const handleAnalysisSuccess = (payload?: AnalysisSuccessPayload) => {
    if (!payload) return
    onAnalysisSuccess?.({ ...payload, batchId: batchIdRef.current })
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const handleReset = () => {
    selectedFiles.forEach((photo) => URL.revokeObjectURL(photo.preview))
    setSelectedFiles([])
    setShowAnalysisForm(false)
  }

  // Если есть начальные фото или показываем форму анализа
  if (showAnalysisForm || (initialPhotos && initialPhotos.length > 0)) {
    return (
      <CommonSheet isOpen={isOpen} onClose={handleClose} backgroundColor="dark">
        <div className="h-[calc(90vh-120px)] overflow-hidden">
          <PhotoAnalysisForm
            initialPhotos={selectedFiles.length > 0 ? selectedFiles : initialPhotos}
            onSuccess={handleAnalysisSuccess}   // ← прокидываем payload наверх
            onReset={handleReset}
          />
        </div>
      </CommonSheet>
    )
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Добавить в гардероб" backgroundColor="dark">
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-gray-300 text-sm">Сфотографируйте вещь или загрузите фото из галереи</p>
        </div>

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
