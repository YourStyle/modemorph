"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Plus } from "lucide-react"
import { useBackgroundPhotoAnalysis } from "@/hooks/use-background-photo-analysis"
import { toast } from "@/hooks/use-toast"

interface BackgroundPhotoUploadProps {
  onPhotosUploaded?: () => void
  maxPhotos?: number
  className?: string
}

export function BackgroundPhotoUpload({ onPhotosUploaded, maxPhotos = 5, className }: BackgroundPhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { startAnalysis } = useBackgroundPhotoAnalysis()
  const [isUploading, setIsUploading] = useState(false)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const filesToUpload = files.slice(0, maxPhotos)

    if (filesToUpload.length < files.length) {
      toast({
        title: "Внимание",
        description: `Загружено только первые ${maxPhotos} фото`,
      })
    }

    setIsUploading(true)

    try {
      const result = await startAnalysis({
        files: filesToUpload,
        onComplete: (data) => {
          toast({
            title: "Анализ завершён!",
            description: `Добавлено ${data.items?.length || 0} вещей в гардероб`,
          })
          if (onPhotosUploaded) {
            onPhotosUploaded()
          }
        },
        onError: (error) => {
          toast({
            title: "Ошибка",
            description: error,
            variant: "destructive",
          })
        },
      })

      if (result.success) {
        toast({
          title: "Анализ начат",
          description: "Вы можете продолжить работу с приложением",
        })
      }
    } catch (error) {
      console.error("Error uploading photos:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось начать анализ фотографий",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        multiple
        onChange={handleFileSelect}
      />

      <Button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="gap-2"
      >
        <Upload className="w-4 h-4" />
        {isUploading ? "Загружаем..." : "Загрузить фото"}
      </Button>
    </div>
  )
}
