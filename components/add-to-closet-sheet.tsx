"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { PhotoAnalysisForm } from "./photo-analysis-form"
import { CommonSheet } from "@/components/common-sheet"
import { useBackgroundPhotoAnalysis } from "@/hooks/use-background-photo-analysis"
import { useAIAnalysis } from "@/contexts/ai-analysis-context"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { PaywallModal } from "./paywall-modal"

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
  const [showPaywall, setShowPaywall] = useState(false)
  const batchIdRef = useRef<string>("")
  const { startAnalysis } = useBackgroundPhotoAnalysis()
  const aiAnalysis = useAIAnalysis()

  // Проверяем активную сессию при открытии
  useEffect(() => {
    if (isOpen) {
      const activeSession = aiAnalysis.getActiveSession()

      if (activeSession) {
        // Если есть активная сессия - используем её batchId и показываем форму
        batchIdRef.current = activeSession.batchId
        setShowAnalysisForm(true)
        setIsAnalyzing(true)
      } else {
        // Генерируем новый batchId только если нет активной сессии
        batchIdRef.current = crypto.randomUUID()
      }
    } else {
      if (!aiAnalysis.getActiveSession()) {
        // Очищаем только если нет активной сессии
        batchIdRef.current = ""
      }
    }
  }, [isOpen, aiAnalysis])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Проверяем, есть ли активная сессия
    const activeSession = aiAnalysis.getActiveSession()
    if (activeSession) {
      toast({
        title: "Анализ уже выполняется",
        description: "Дождитесь завершения текущего анализа или сверните его в виджет",
        variant: "destructive",
      })
      return
    }

    const newPhotos: UploadedPhoto[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substr(2, 9),
    }))

    setSelectedFiles(newPhotos)
    setShowAnalysisForm(true)
  }

  const handlePhotoUpload = () => {
    // Проверяем, есть ли активная сессия перед открытием file input
    const activeSession = aiAnalysis.getActiveSession()
    if (activeSession) {
      toast({
        title: "Анализ уже выполняется",
        description: "Дождитесь завершения текущего анализа или сверните его в виджет",
        variant: "destructive",
      })
      return
    }

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

    const activeSession = aiAnalysis.getActiveSession()

    if (!activeSession) {
      handleReset()
      onClose()
      return
    }

    // Анализ УЖЕ запущен из PhotoAnalysisForm через startAnalysis
    // НЕ нужно вызывать startAnalysis снова - это создаст дубликаты запросов!
    // Просто закрываем шторку, виджет продолжит отслеживать прогресс из AIAnalysisContext

    // Закрываем шторку БЕЗ вызова handleReset (чтобы не очистить состояние)
    onClose()

    toast({
      title: "Анализ свёрнут",
      description: "Вы можете продолжить работу с приложением. Прогресс отображается в виджете.",
    })
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
        <CommonSheet isOpen={isOpen} onClose={handleClose} backgroundColor="dark" onMinimize={handleMinimize}>
          {/* скролл контейнер, стабильный скроллбар, хороший контраст текста */}
          <div
            className="h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-2 pb-20 pb-safe text-neutral-100"
            style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
          >
            <PhotoAnalysisForm
              initialPhotos={selectedFiles.length > 0 ? selectedFiles : initialPhotos}
              batchId={batchIdRef.current}
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
    <>
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

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false)
          toast({
            title: "Лимиты обновлены",
            description: "Попробуйте еще раз",
          })
        }}
      />
    </>
  )
}
