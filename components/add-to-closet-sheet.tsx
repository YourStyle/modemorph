"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { ImageUploadForm } from "./image-upload-form"
import { CommonSheet } from "@/components/common-sheet"

interface AddToClosetSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function AddToClosetSheet({ isOpen, onClose }: AddToClosetSheetProps) {
  const [showUploadForm, setShowUploadForm] = useState(false)

  const handlePhotoUpload = () => {
    setShowUploadForm(true)
  }

  const handleSuccess = () => {
    setShowUploadForm(false)
    onClose()
  }

  const handleClose = () => {
    setShowUploadForm(false)
    onClose()
  }

  if (showUploadForm) {
    return (
      <CommonSheet isOpen={isOpen} onClose={handleClose}>
        <div className="h-[calc(90vh-120px)] overflow-hidden">
          <ImageUploadForm onSuccess={handleSuccess} />
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
