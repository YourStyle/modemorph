"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { useAIAnalysis } from "@/contexts/ai-analysis-context"
import { useTryOn } from "@/contexts/try-on-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, CheckCircle2, Loader2, AlertTriangle, Check, Shirt, Sparkles } from "lucide-react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { CommonSheet } from "@/components/common-sheet"
import { api } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import Image from "next/image"
import FallingObjectsGame from "@/components/falling-objects-game"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

/** Плоская сигнальная полоса прогресса — один акцент, без градиента.
    Моторика только на transform (scaleX), не на width. */
const ProgressBlock: React.FC<{ progress: number; progressText: string }> = ({ progress, progressText }) => (
  <div className="w-full max-w-sm mx-auto mt-4">
    <div className="relative h-1.5 w-full bg-canvas-sunk rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full w-full origin-left bg-signal rounded-full transition-transform duration-300"
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress / 100))})` }}
      />
    </div>
    <div className="flex justify-between text-caption mt-2 text-ink-3">
      <span>{progressText}</span>
      <span>{Math.round(progress)}%</span>
    </div>
  </div>
)

interface LoadingExperienceProps {
  showGame: boolean
  setShowGame: (v: boolean) => void
  progress: number
  progressText: string
}

const LoadingExperience: React.FC<LoadingExperienceProps> = ({ showGame, setShowGame, progress, progressText }) => {
  const GAME_HEIGHT = 300

  if (!showGame) {
    return (
      <>
        <div
          className="w-full rounded-2xl border border-line bg-canvas-sunk flex items-center justify-center overflow-hidden"
          style={{ height: `${GAME_HEIGHT}px` }}
        >
          <div className="w-full px-4 max-w-xs mx-auto text-center select-none" style={{ touchAction: "manipulation" }}>
            <p className="text-body text-ink-2 mb-4">Пока ИИ анализирует фото:</p>
            <button
              className="w-full h-11 rounded-full bg-ink text-signal-ink font-medium px-4 border-0 transition-transform duration-press active:scale-[.98]"
              onPointerUp={() => setShowGame(true)}
            >
              Сыграть в игру
            </button>
          </div>
        </div>
        <ProgressBlock progress={progress} progressText={progressText} />
      </>
    )
  }

  return (
    <>
      <div className="w-full rounded-xl overflow-hidden" style={{ height: `${GAME_HEIGHT}px` }}>
        <FallingObjectsGame
          analysisDone={progress >= 100}
          onRequestFinish={() => setShowGame(false)}
        />
      </div>
      <ProgressBlock progress={progress} progressText={progressText} />
    </>
  )
}

// Компонент кругового прогресса
const CircularProgress = ({ progress, size = 64 }: { progress: number; size?: number }) => {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Фоновый круг */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        className="text-line"
      />
      {/* Прогресс — единственный акцент бабла */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-signal transition-[stroke-dashoffset] duration-300"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BackgroundTasksWidget() {
  const { tasks, removeTask } = useBackgroundTasks()
  const aiAnalysis = useAIAnalysis()
  const { setSheetOpen: setTryOnSheetOpen } = useTryOn()
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  const [showResultsSheet, setShowResultsSheet] = useState(false)
  const [showProgressSheet, setShowProgressSheet] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [addingItems, setAddingItems] = useState<Set<number>>(new Set())
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set())
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)
  const [hasShownCloseConfirm, setHasShownCloseConfirm] = useState(false)
  const shownTooltipsRef = useRef<Set<string>>(new Set())

  const [showGame, setShowGame] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [activeTabIndex, setActiveTabIndex] = useState(0)

  // Update 'now' every second to check for expired error tasks
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Показываем tooltip когда задача завершена
  useEffect(() => {
    const newlyCompleted = tasks.filter(
      (task) => task.status === "completed" && !shownTooltipsRef.current.has(task.id)
    )
    if (newlyCompleted.length > 0) {
      newlyCompleted.forEach((t) => shownTooltipsRef.current.add(t.id))
      setShowTooltip("aggregate")
      setTimeout(() => {
        setShowTooltip((current) => (current === "aggregate" ? null : current))
      }, 5000)
    }
  }, [tasks])

  const activeTasks = useMemo(() => {
    return tasks.filter((task) => task.status !== "error" || now - task.startedAt.getTime() < 10000)
  }, [tasks, now])

  // Агрегированное состояние бабла
  const bubbleState = useMemo(() => {
    const processing = activeTasks.filter((t) => t.status === "processing")
    const completed = activeTasks.filter((t) => t.status === "completed")
    const errors = activeTasks.filter((t) => t.status === "error")

    // Приоритет: processing > completed > error
    let status: "processing" | "completed" | "error" = "error"
    if (completed.length > 0) status = "completed"
    if (processing.length > 0) status = "processing"

    // Прогресс — среднее по processing задачам
    const avgProgress = processing.length > 0
      ? processing.reduce((sum, t) => sum + t.progress, 0) / processing.length
      : 0

    // Тип иконки — если есть try-on, показываем Sparkles
    const hasTryOn = activeTasks.some((t) => t.type === "virtual_tryon")

    return { status, avgProgress, count: activeTasks.length, processing, completed, errors, hasTryOn }
  }, [activeTasks])

  // Завершённые задачи с сессиями (для табов в шторке результатов)
  const completedSessions = useMemo(() => {
    return bubbleState.completed
      .filter((t) => t.type !== "virtual_tryon" && t.data?.sessionId)
      .map((t) => ({
        taskId: t.id,
        sessionId: t.data.sessionId as string,
        itemsCount: t.data?.itemsCount || 0,
        type: t.type,
      }))
  }, [bubbleState.completed])

  const handleBubbleClick = useCallback(() => {
    // Если единственная задача — try-on, открываем TryOnSheet
    if (activeTasks.length === 1 && activeTasks[0].type === "virtual_tryon") {
      setTryOnSheetOpen(true)
      return
    }

    // Если есть try-on среди задач и он единственный завершённый
    const completedTryOn = activeTasks.filter((t) => t.type === "virtual_tryon" && t.status === "completed")
    if (completedTryOn.length > 0 && completedSessions.length === 0) {
      setTryOnSheetOpen(true)
      return
    }

    // Если есть завершённые сессии с результатами — открываем шторку результатов
    if (completedSessions.length > 0) {
      setActiveTabIndex(0)
      setSelectedSessionId(completedSessions[0].sessionId)
      setShowResultsSheet(true)
      return
    }

    // Если есть processing задачи — открываем прогресс
    const firstProcessing = activeTasks.find((t) => t.status === "processing" && t.type !== "virtual_tryon")
    if (firstProcessing?.data?.sessionId) {
      setSelectedSessionId(firstProcessing.data.sessionId)
      setShowProgressSheet(true)
      return
    }

    // Если processing try-on
    if (activeTasks.some((t) => t.status === "processing" && t.type === "virtual_tryon")) {
      setTryOnSheetOpen(true)
      return
    }
  }, [activeTasks, completedSessions, setTryOnSheetOpen])

  const handleTabChange = useCallback((index: number) => {
    if (completedSessions[index]) {
      setActiveTabIndex(index)
      setSelectedSessionId(completedSessions[index].sessionId)
      setAddedItems(new Set())
      setAddingItems(new Set())
      setHasShownCloseConfirm(false)
    }
  }, [completedSessions])

  const handleAddItem = async (item: any, index: number) => {
    try {
      setAddingItems((prev) => new Set(prev).add(index))

      // Загружаем изображение в S3 перед сохранением в базу данных
      let imageUrl = item.finalImageUrl || item.image_url
      if (item.img_url || item.image_url) {
        const imageToUpload = item.img_url || item.image_url

        // Загружаем только если это base64 или требуется обработка
        if (imageToUpload && (imageToUpload.startsWith("data:image/") || /^[A-Za-z0-9+/]+=*$/.test(imageToUpload))) {
          console.log("[BackgroundTasksWidget] Uploading image to S3...")
          const { downloadAndUploadImage } = await import("@/lib/image-processing")
          imageUrl = await downloadAndUploadImage(imageToUpload)
        } else if (item.basic_item_id && !imageUrl) {
          // Загружаем из базовых items если нужно
          const basicItem = await api.get(`/api/basic-items/${item.basic_item_id}`)
          imageUrl = basicItem.image_url
        }
      }

      const itemData = {
        item_name: item.item_name || item.name,
        // Бэкенд резолвит английский ответ Gemini в канонический слаг
        // (backend/app/api/misc.py -> clothing_taxonomy.resolve_clothing_type).
        // Сырой clothing_item писать в колонку нельзя: 'sweater'/'polo shirt'
        // не понимает ни один потребитель слотов.
        clothing_type: item.clothing_type || null,
        material: item.material || "",
        color: item.color || "",
        style: item.style || "",
        has_print: item.has_print === "yes" ? "есть" : "нет",
        shade: item.shade || "",
        has_details: item.has_details || "",
        image_url: imageUrl,
        basic_item_id: item.basic_item_id || null,
      }

      await api.post("/api/wardrobe-user-items", itemData)

      setAddedItems((prev) => new Set(prev).add(index))
      setAddingItems((prev) => {
        const newSet = new Set(prev)
        newSet.delete(index)
        return newSet
      })

      // Dispatch event to refresh wardrobe items
      window.dispatchEvent(new CustomEvent("wardrobe-item-added"))
    } catch (error) {
      console.error("Error adding item:", error)
      setAddingItems((prev) => {
        const newSet = new Set(prev)
        newSet.delete(index)
        return newSet
      })
      toast({
        title: "Ошибка",
        description: "Не удалось добавить вещь в гардероб",
        variant: "destructive",
      })
    }
  }

  const handleCleanupSession = (sessionId?: string) => {
    const targetSessionId = sessionId || selectedSessionId
    if (targetSessionId) {
      const task = tasks.find(t => t.data?.sessionId === targetSessionId)
      if (task) removeTask(task.id)
      aiAnalysis.removeSession(targetSessionId)
    }
  }

  const handleCleanupAllSessions = () => {
    // Очищаем все завершённые сессии
    completedSessions.forEach((s) => handleCleanupSession(s.sessionId))
    setAddedItems(new Set())
    setAddingItems(new Set())
    setHasShownCloseConfirm(false)
    setSelectedSessionId(null)
    setActiveTabIndex(0)
  }

  const handleResultsSheetClose = () => {
    // Проверяем есть ли незавершённые сессии (с неподтверждённым закрытием)
    const hasUnconfirmed = completedSessions.some((s) => {
      const session = aiAnalysis.getSession(s.sessionId)
      return session?.status === "completed"
    })

    if (hasUnconfirmed && !hasShownCloseConfirm) {
      setShowCloseConfirmDialog(true)
      return
    }

    setShowResultsSheet(false)
    handleCleanupAllSessions()
  }

  const handleConfirmClose = () => {
    setShowCloseConfirmDialog(false)
    setShowResultsSheet(false)
    handleCleanupAllSessions()
  }

  const handleCancelClose = () => {
    setShowCloseConfirmDialog(false)
    setHasShownCloseConfirm(true)
  }

  // Automatically open progress sheet when a new processing task is created
  const prevTasksRef = useRef<typeof tasks>([])
  useEffect(() => {
    const newProcessingTasks = tasks.filter(
      (task) =>
        task.status === "processing" &&
        task.type !== "virtual_tryon" &&
        !prevTasksRef.current.find((prevTask) => prevTask.id === task.id)
    )

    if (newProcessingTasks.length > 0 && !showProgressSheet && !showResultsSheet) {
      // New processing task detected - auto-open progress sheet
      const firstTask = newProcessingTasks[0]
      console.log("[BackgroundTasksWidget] Auto-opening progress sheet for new task:", firstTask.id)
      setSelectedSessionId(firstTask.data.sessionId)
      setShowProgressSheet(true)
    }

    prevTasksRef.current = tasks
  }, [tasks, showProgressSheet, showResultsSheet])

  // Automatically transition from progress sheet to results sheet when analysis completes
  useEffect(() => {
    if (showProgressSheet && selectedSessionId) {
      const session = aiAnalysis.getSession(selectedSessionId)
      const task = tasks.find(t => t.data?.sessionId === selectedSessionId)

      const isCompleted = task?.status === "completed" ||
                         (session?.status === "completed") ||
                         (session?.progress === 100 && session?.items && session.items.length > 0)

      if (isCompleted && session && session.items && session.items.length > 0) {
        setShowProgressSheet(false)
        setShowResultsSheet(true)
        setHasShownCloseConfirm(false)
        // Ставим таб на только что завершённую сессию
        const tabIdx = completedSessions.findIndex((s) => s.sessionId === selectedSessionId)
        if (tabIdx >= 0) setActiveTabIndex(tabIdx)
      }
    }
  }, [showProgressSheet, selectedSessionId, aiAnalysis, tasks, completedSessions])

  // Отслеживаем смену сессии для очистки стейтов
  const prevSessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    // Если сменилась сессия - очищаем стейты добавленных вещей
    if (selectedSessionId && selectedSessionId !== prevSessionIdRef.current) {
      setAddedItems(new Set())
      setAddingItems(new Set())
      setHasShownCloseConfirm(false)
    }
    prevSessionIdRef.current = selectedSessionId
  }, [selectedSessionId])

  // Don't hide widget if results or progress sheet is open
  if (activeTasks.length === 0 && !showResultsSheet && !showProgressSheet) return null

  // Бабл — часть системного хрома (LIQUID_GLASS.md: «плавающие контролы поверх
  // фото» — один из двух разрешённых постоянных стеклянных элементов). Обязан
  // держаться строго над таб-баром: бар 50px + safe-area, плюс 16px зазор,
  // чтобы никогда не наезжать на подпись активного пункта.
  const bubbleBottomStyle = { bottom: "calc(50px + env(safe-area-inset-bottom, 0px) + 16px)" }

  const bubbleStateBorder = bubbleState.status === "completed"
    ? "border-signal/40"
    : bubbleState.status === "error"
    ? "border-destructive/40"
    : "border-line"

  return (
    <>
      {/* Единый агрегированный бабл */}
      <div className="fixed right-4 z-40" style={bubbleBottomStyle}>
        <div className="relative">
          <div
            onClick={handleBubbleClick}
            className={cn(
              "glass relative w-16 h-16 rounded-full cursor-pointer border transition-transform duration-press ease-out active:scale-95 will-change-transform",
              bubbleStateBorder
            )}
          >
            {/* Круговой прогресс */}
            {bubbleState.status === "processing" && (
              <div className="absolute inset-0">
                <CircularProgress progress={bubbleState.avgProgress} size={64} />
              </div>
            )}

            {/* Иконка и процент */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {bubbleState.status === "processing" && (
                <>
                  {bubbleState.hasTryOn ? (
                    <Sparkles className="w-5 h-5 text-signal -mt-1" strokeWidth={1.75} />
                  ) : (
                    <Shirt className="w-5 h-5 text-signal -mt-1" strokeWidth={1.75} />
                  )}
                  <span className="text-[10px] font-bold text-ink mt-0.5 ml-[1px]">
                    {Math.round(bubbleState.avgProgress)}%
                  </span>
                </>
              )}
              {/* Бабл сам уже круг — иконка без своего кольца, чтобы не рисовать круг в круге */}
              {bubbleState.status === "completed" && <Check className="w-7 h-7 text-signal" strokeWidth={2} />}
              {bubbleState.status === "error" && <AlertTriangle className="w-6 h-6 text-destructive" strokeWidth={1.75} />}
            </div>

            {/* Бейдж с количеством задач */}
            {bubbleState.count > 1 && (
              <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-ink text-signal-ink">
                {bubbleState.count}
              </div>
            )}

            {/* Кнопка закрытия — убирает все задачи */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (showResultsSheet) setShowResultsSheet(false)
                if (showProgressSheet) setShowProgressSheet(false)
                activeTasks.forEach((t) => removeTask(t.id))
              }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-ink text-signal-ink rounded-full flex items-center justify-center hover:bg-ink/80 transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </div>

          {/* Tooltip */}
          {showTooltip === "aggregate" && bubbleState.completed.length > 0 && (
            <div className="absolute -top-14 right-0 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-ink text-signal-ink px-3 py-2 rounded-2xl text-caption font-medium whitespace-nowrap">
                {bubbleState.completed.length === 1
                  ? (bubbleState.completed[0].type === "virtual_tryon" ? "Примерка готова!" : "Анализ завершён!")
                  : `Готово: ${bubbleState.completed.length} ${bubbleState.completed.length < 5 ? "задачи" : "задач"}`}
                <div className="absolute bottom-0 right-6 transform translate-y-1/2 rotate-45 w-2 h-2 bg-ink" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Шторка с результатами (с табами при нескольких сессиях) */}
      <CommonSheet
        isOpen={showResultsSheet}
        onClose={handleResultsSheetClose}
        backgroundColor="dark"
        swipeAction="close"
      >
        <div className="h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-2 pb-20 pb-safe text-ink">
            {/* Табы — показываем только если больше одной сессии */}
            {completedSessions.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                {completedSessions.map((s, i) => {
                  const session = aiAnalysis.getSession(s.sessionId)
                  const count = session?.items?.length || s.itemsCount || 0
                  const isActive = i === activeTabIndex
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => handleTabChange(i)}
                      className={cn(
                        "flex-shrink-0 px-4 py-2 rounded-full text-caption font-medium transition-transform duration-press active:scale-95",
                        isActive
                          ? "bg-ink text-signal-ink"
                          : "bg-canvas-sunk text-ink-2 hover:text-ink"
                      )}
                    >
                      Анализ {i + 1}
                      {count > 0 && (
                        <span className={cn(
                          "ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
                          isActive ? "bg-canvas/25 text-signal-ink" : "bg-line text-ink-2"
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {(() => {
              const session = selectedSessionId ? aiAnalysis.getSession(selectedSessionId) : null
              const itemsCount = session?.items.length || 0

              return (
                <>
                  <div className="mb-6">
                    <h2 className="text-h2 text-ink mb-2">Результаты анализа</h2>
                    <p className="text-caption text-ink-2">
                      {itemsCount > 0
                        ? `Найдено ${itemsCount} ${itemsCount === 1 ? "вещь" : itemsCount < 5 ? "вещи" : "вещей"}`
                        : "Результаты анализа фотографий"}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {session?.items?.map((item: any, index: number) => (
                <Card key={index} className="bg-canvas-sunk border-line overflow-hidden rounded-2xl">
                  <CardContent className="flex flex-col sm:flex-row gap-4 p-4">
                    {/* Изображение */}
                    {(item.finalImageUrl || item.image_url || item.img_url) ? (
                      <div className="relative w-24 h-24 flex-shrink-0">
                        <Image
                          src={item.finalImageUrl || item.image_url || item.img_url}
                          alt={item.item_name || item.name}
                          fill
                          className="rounded-xl object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-line/60 rounded-xl flex items-center justify-center">
                        <Shirt className="w-8 h-8 text-ink-3" strokeWidth={1.75} />
                      </div>
                    )}

                    {/* Информация */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-body text-ink">
                            {item.item_name || item.name}
                          </h3>
                          {item.basic_item_id && (
                            <Badge className="mt-1 bg-canvas-sunk text-ink-2 border-line">
                              Базовая
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-caption text-ink-2 space-y-1">
                        {item.material && (
                          <p>Материал: <span className="text-ink">{item.material}</span></p>
                        )}
                        {item.color && (
                          <p>Цвет: <span className="text-ink">{item.color}</span></p>
                        )}
                        {item.shade && (
                          <p>Оттенок: <span className="text-ink">{item.shade}</span></p>
                        )}
                        {item.style && (
                          <p>Стиль: <span className="text-ink">{item.style}</span></p>
                        )}
                      </div>

                      {/* Кнопка добавления */}
                      <Button
                        onClick={() => handleAddItem(item, index)}
                        disabled={addingItems.has(index) || addedItems.has(index)}
                        variant={addedItems.has(index) ? "secondary" : "default"}
                        size="sm"
                        className="w-full mt-3 rounded-full"
                      >
                        {addingItems.has(index) && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        {addedItems.has(index) && (
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        {addingItems.has(index)
                          ? "Добавляем..."
                          : addedItems.has(index)
                          ? "Добавлено"
                          : "Добавить в гардероб"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
                  </div>
                </>
              )
            })()}
          </div>
      </CommonSheet>

      {/* Шторка с прогрессом анализа */}
      <CommonSheet
        isOpen={showProgressSheet}
        onClose={() => {
          setShowProgressSheet(false)
          setShowGame(false)
        }}
        backgroundColor="dark"
        swipeAction="minimize"
        onMinimize={() => {
          setShowProgressSheet(false)
          setShowGame(false)
        }}
      >
        <div className="h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-2 pb-20 pb-safe">
          {(() => {
            const session = selectedSessionId ? aiAnalysis.getSession(selectedSessionId) : null
            const progress = session?.progress || 0
            const progressText = session?.progressText || "Анализируем..."

            return (
              <div className="text-ink">
                <LoadingExperience
                  showGame={showGame}
                  setShowGame={setShowGame}
                  progress={progress}
                  progressText={progressText}
                />
              </div>
            )
          })()}
        </div>
      </CommonSheet>

      {/* Диалог подтверждения закрытия результатов */}
      <Dialog open={showCloseConfirmDialog} onOpenChange={setShowCloseConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Вы добавили все вещи?</DialogTitle>
            <DialogDescription>
              Вы уверены, что добавили все понравившиеся вещи в гардероб?
              После закрытия результаты анализа будут удалены.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button onClick={handleCancelClose} variant="outline" className="w-full">
              Вернуться к результатам
            </Button>
            <Button onClick={handleConfirmClose} variant="default" className="w-full">
              Да, закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
