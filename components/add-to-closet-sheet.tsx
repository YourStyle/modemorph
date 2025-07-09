"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { ImageUploadForm } from "./image-upload-form"

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

  if (showUploadForm) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0">
          <SheetHeader className="p-4 pb-2 border-b">
            <SheetTitle className="text-center text-xl font-serif">Добавить в гардероб</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(90vh-80px)] overflow-hidden">
            <ImageUploadForm onSuccess={handleSuccess} />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl bg-gray-800 text-white border-gray-700">
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6" />

        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold mb-2">Добавить в гардероб</h2>
          <p className="text-gray-400 text-sm">
            Персонализируйте свои будущие образы и узнайте, как стилизовать вещи из гардероба
          </p>
        </div>

        <div className="space-y-3 pb-8">
          <Button
            onClick={handlePhotoUpload}
            className="w-full bg-white text-gray-900 hover:bg-gray-100 h-14 rounded-2xl text-base font-medium"
          >
            <Camera className="w-5 h-5 mr-3" />
            Найти вещи на фото
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
