"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { PhotoAnalysisForm } from "./photo-analysis-form"
import { CommonSheet } from "@/components/common-sheet"
import { useBackgroundPhotoAnalysis } from "@/hooks/use-background-photo-analysis"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const batchIdRef = useRef<string>("")
  const { startAnalysis } = useBackgroundPhotoAnalysis()

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

  // ⚠️ Не закрываем шторку по успешному анализу — отдаём данные наверх
  const handleAnalysisSuccess = (payload?: AnalysisSuccessPayload) => {
    if (!payload) return
    onAnalysisSuccess?.({ ...payload, batchId: batchIdRef.current })
  }

  const handleClose = () => {
    // Если анализ идет, показываем диалог подтверждения
    if (isAnalyzing) {
      setShowConfirmDialog(true)
      return
    }
    // Иначе просто закрываем
    handleReset()
    onClose()
  }

  const handleConfirmClose = () => {
    // Закрыть и прервать анализ
    setShowConfirmDialog(false)
    handleReset()
    onClose()
  }

  const handleMinimize = async () => {
    // Свернуть анализ в фоновый режим
    setShowConfirmDialog(false)

    const filesToAnalyze = selectedFiles.length > 0 ? selectedFiles : initialPhotos

    if (filesToAnalyze.length === 0) {
      handleReset()
      onClose()
      return
    }

    try {
      await startAnalysis({
        files: filesToAnalyze.map(p => p.file),
        onComplete: (data) => {
          toast({
            title: "Анализ завершён!",
            description: `Добавлено ${data.items?.length || 0} вещей в гардероб`,
          })
          // Если был передан onAnalysisSuccess, вызываем его
          if (onAnalysisSuccess && data.items) {
            onAnalysisSuccess({
              items: data.items,
              photos: filesToAnalyze,
              analysisResults: [{ success: true, items: data.items }],
              batchId: batchIdRef.current,
            })
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

      toast({
        title: "Анализ свёрнут",
        description: "Вы можете продолжить работу с приложением. Прогресс отображается в виджете.",
      })
    } catch (error) {
      console.error("Error starting background analysis:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось начать фоновый анализ",
        variant: "destructive",
      })
    }

    handleReset()
    onClose()
  }

  const handleCancelClose = () => {
    // Просто закрыть диалог, вернуться к анализу
    setShowConfirmDialog(false)
  }

  const handleReset = () => {
    selectedFiles.forEach((photo) => URL.revokeObjectURL(photo.preview))
    setSelectedFiles([])
    setShowAnalysisForm(false)
  }

  // Если есть начальные фото или показываем форму анализа
  if (showAnalysisForm || (initialPhotos && initialPhotos.length > 0)) {
    return (
      <>
        <CommonSheet isOpen={isOpen} onClose={handleClose} backgroundColor="dark">
          {/* скролл контейнер, стабильный скроллбар, хороший контраст текста */}
          <div
            className="h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-2 pb-20 pb-safe text-neutral-100"
            style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
          >
            <PhotoAnalysisForm
              initialPhotos={selectedFiles.length > 0 ? selectedFiles : initialPhotos}
              onSuccess={handleAnalysisSuccess}
              onReset={handleReset}
              onLoadingChange={setIsAnalyzing}
            />
          </div>
        </CommonSheet>

        {/* Диалог подтверждения закрытия */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Анализ в процессе</DialogTitle>
              <DialogDescription>
                Если вы закроете это окно, анализ фотографий будет прерван.
                Вы можете свернуть анализ в виджет и продолжить работу с приложением.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-col gap-2">
              <Button onClick={handleMinimize} className="w-full">
                Свернуть в виджет
              </Button>
              <Button onClick={handleConfirmClose} variant="destructive" className="w-full">
                Закрыть и прервать
              </Button>
              <Button onClick={handleCancelClose} variant="outline" className="w-full">
                Отмена
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Добавить в гардероб" backgroundColor="dark">
      <div className="space-y-6 text-neutral-100">
        <div className="text-center">
          <p className="text-sm text-neutral-300">Сфотографируйте вещь или загрузите фото из галереи</p>
        </div>

        <Button
          type="button"
          aria-label="Загрузить фото вещей"
          onClick={handlePhotoUpload}
          className="w-full bg-white text-neutral-900 hover:bg-neutral-100 h-14 rounded-2xl text-base font-medium"
        >
          <Camera className="w-5 h-5 mr-3" />
          Найти вещи на фото
        </Button>
      </div>
    </CommonSheet>
  )
}
