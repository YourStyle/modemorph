"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { useAIAnalysis } from "@/contexts/ai-analysis-context"
import { useAddToCloset } from "@/contexts/add-to-closet-context"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, CheckCircle2, Loader2, AlertCircle, Shirt, ChevronDown } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { CommonSheet } from "@/components/common-sheet"
import { api } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import Image from "next/image"

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
        className="text-gray-200"
      />
      {/* Прогресс */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-blue-600 transition-all duration-300"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BackgroundTasksWidget() {
  const { tasks, removeTask } = useBackgroundTasks()
  const aiAnalysis = useAIAnalysis()
  const { openSheet } = useAddToCloset()
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  const [showResultsSheet, setShowResultsSheet] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [addingItems, setAddingItems] = useState<Set<number>>(new Set())
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set())
  const shownTooltipsRef = useRef<Set<string>>(new Set())

  // Показываем tooltip когда задача завершена
  useEffect(() => {
    tasks.forEach((task) => {
      if (task.status === "completed" && !shownTooltipsRef.current.has(task.id)) {
        shownTooltipsRef.current.add(task.id)
        setShowTooltip(task.id)
        // Скрываем tooltip через 5 секунд
        setTimeout(() => {
          setShowTooltip((current) => (current === task.id ? null : current))
        }, 5000)
      }
    })
  }, [tasks])

  const activeTasks = tasks.filter((task) => task.status !== "error" || Date.now() - task.startedAt.getTime() < 10000)

  const handleTaskClick = (task: any) => {
    console.log("[BackgroundTasksWidget] handleTaskClick called")
    console.log("[BackgroundTasksWidget] Task:", task)
    console.log("[BackgroundTasksWidget] Task status:", task.status)
    console.log("[BackgroundTasksWidget] Task data:", task.data)

    // Если задача в процессе или завершена - открываем шторку
    if (task.data?.sessionId) {
      console.log("[BackgroundTasksWidget] Task has sessionId:", task.data.sessionId)
      const session = aiAnalysis.getSession(task.data.sessionId)
      console.log("[BackgroundTasksWidget] Session found:", session)

      if (session) {
        // Если задача завершена и есть результаты - показываем результаты
        if (task.status === "completed" && session.items.length > 0) {
          console.log("[BackgroundTasksWidget] Opening results sheet for completed task")
          setSelectedSessionId(task.data.sessionId)
          setShowResultsSheet(true)
        }
        // Если задача в процессе - открываем шторку для просмотра прогресса
        else if (task.status === "processing") {
          console.log("[BackgroundTasksWidget] Opening analysis sheet for processing task")
          openSheet()
        }
      } else {
        console.warn("[BackgroundTasksWidget] Session not found for sessionId:", task.data.sessionId)
      }
    } else {
      console.log("[BackgroundTasksWidget] Task has no sessionId")
      // Если нет sessionId, но есть активная сессия - используем её
      const activeSession = aiAnalysis.getActiveSession()
      console.log("[BackgroundTasksWidget] Active session:", activeSession)

      if (activeSession && task.status === "processing") {
        console.log("[BackgroundTasksWidget] Opening sheet using active session")
        openSheet()
      } else {
        console.warn("[BackgroundTasksWidget] Cannot open sheet - no active session or task not processing")
      }
    }
  }

  const handleAddItem = async (item: any, index: number) => {
    try {
      setAddingItems((prev) => new Set(prev).add(index))

      const itemData = {
        item_name: item.item_name || item.name,
        material: item.material || "",
        color: item.color || "",
        style: item.style || "",
        has_print: item.has_print === "yes" ? "есть" : "нет",
        shade: item.shade || "",
        has_details: item.has_details || "",
        image_url: item.finalImageUrl || item.image_url,
        basic_item_id: item.basic_item_id || null,
      }

      await api.post("/api/wardrobe-user-items", itemData)

      setAddedItems((prev) => new Set(prev).add(index))
      setAddingItems((prev) => {
        const newSet = new Set(prev)
        newSet.delete(index)
        return newSet
      })

      toast({
        title: "Вещь добавлена",
        description: `${item.item_name || item.name} добавлена в ваш гардероб`,
      })
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

  const handleMinimizeSheet = () => {
    setShowResultsSheet(false)
  }

  if (activeTasks.length === 0) return null

  return (
    <>
      <div className="fixed bottom-24 right-4 z-50 space-y-3">
      {activeTasks.map((task) => {
        const isCompleted = task.status === "completed"
        const isError = task.status === "error"
        const showCompletedTooltip = showTooltip === task.id && isCompleted

        return (
          <div key={task.id} className="relative">
            {/* Компактный круглый виджет с liquid glass эффектом */}
            <div
              onClick={() => handleTaskClick(task)}
              className="relative w-16 h-16 rounded-full shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              style={{
                background: isCompleted
                  ? 'rgba(34, 197, 94, 0.15)'
                  : isError
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                boxShadow: isCompleted
                  ? '0 8px 32px 0 rgba(34, 197, 94, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)'
                  : isError
                  ? '0 8px 32px 0 rgba(239, 68, 68, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)'
                  : '0 8px 32px 0 rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)',
                border: isCompleted
                  ? '1px solid rgba(34, 197, 94, 0.3)'
                  : isError
                  ? '1px solid rgba(239, 68, 68, 0.3)'
                  : '1px solid rgba(255, 255, 255, 0.18)',
              }}
            >
              {/* Gradient overlay для liquid glass эффекта */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: isCompleted
                    ? 'radial-gradient(circle at 30% 30%, rgba(34, 197, 94, 0.3) 0%, transparent 70%)'
                    : isError
                    ? 'radial-gradient(circle at 30% 30%, rgba(239, 68, 68, 0.3) 0%, transparent 70%)'
                    : 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
                }}
              />
              {/* Круговой прогресс */}
              {task.status === "processing" && (
                <div className="absolute inset-0">
                  <CircularProgress progress={task.progress} size={64} />
                </div>
              )}

              {/* Иконка и процент */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {task.status === "processing" && (
                  <>
                    <Shirt className="w-5 h-5 text-blue-600 -mt-1" />
                    <span className="text-[10px] font-bold text-gray-700 mt-0.5 ml-[1px]">
                      {Math.round(task.progress)}%
                    </span>
                  </>
                )}
                {isCompleted && <CheckCircle2 className="w-7 h-7 text-green-600" />}
                {isError && <AlertCircle className="w-7 h-7 text-red-600" />}
              </div>

              {/* Кнопка закрытия */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeTask(task.id)
                }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors shadow-md"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Tooltip для завершённой задачи */}
            {showCompletedTooltip && (
              <div className="absolute -top-14 right-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-medium shadow-lg whitespace-nowrap">
                  Анализ завершён!
                  {task.data?.itemsCount && (
                    <span className="ml-1">
                      ({task.data.itemsCount} {task.data.itemsCount === 1 ? "вещь" : "вещей"})
                    </span>
                  )}
                  <div className="absolute bottom-0 right-6 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900" />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>

      {/* Шторка с результатами */}
      <CommonSheet
        isOpen={showResultsSheet}
        onClose={() => setShowResultsSheet(false)}
        backgroundColor="dark"
        onMinimize={handleMinimizeSheet}
      >
        <div className="h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-2 pb-20 pb-safe text-neutral-100">
            {(() => {
              const session = selectedSessionId ? aiAnalysis.getSession(selectedSessionId) : null
              const itemsCount = session?.items.length || 0

              console.log("[BackgroundTasksWidget Results] selectedSessionId:", selectedSessionId)
              console.log("[BackgroundTasksWidget Results] session:", session)
              console.log("[BackgroundTasksWidget Results] items:", session?.items)

              return (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-white mb-2">Результаты анализа</h2>
                    <p className="text-neutral-300 text-sm">
                      {itemsCount > 0
                        ? `Найдено ${itemsCount} ${itemsCount === 1 ? "вещь" : itemsCount < 5 ? "вещи" : "вещей"}`
                        : "Результаты анализа фотографий"}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {session?.items?.map((item: any, index: number) => (
                <Card key={index} className="bg-white/5 border-white/10 overflow-hidden">
                  <CardContent className="flex flex-col sm:flex-row gap-4 p-4">
                    {/* Изображение */}
                    {(item.finalImageUrl || item.image_url || item.img_url) ? (
                      <div className="relative w-full sm:w-24 h-40 sm:h-24 flex-shrink-0">
                        <Image
                          src={item.finalImageUrl || item.image_url || item.img_url}
                          alt={item.item_name || item.name}
                          fill
                          className="rounded-md object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-full sm:w-24 h-40 sm:h-24 bg-white/10 rounded-md flex items-center justify-center text-3xl">
                        👕
                      </div>
                    )}

                    {/* Информация */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-white text-base">
                            {item.item_name || item.name}
                          </h3>
                          {item.basic_item_id && (
                            <Badge className="mt-1 bg-blue-500/20 text-blue-300 border-blue-500/30">
                              Базовая
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-sm text-neutral-300 space-y-1">
                        {item.material && (
                          <p>Материал: <span className="text-white">{item.material}</span></p>
                        )}
                        {item.color && (
                          <p>Цвет: <span className="text-white">{item.color}</span></p>
                        )}
                        {item.shade && (
                          <p>Оттенок: <span className="text-white">{item.shade}</span></p>
                        )}
                        {item.style && (
                          <p>Стиль: <span className="text-white">{item.style}</span></p>
                        )}
                      </div>

                      {/* Кнопка добавления */}
                      <Button
                        onClick={() => handleAddItem(item, index)}
                        disabled={addingItems.has(index) || addedItems.has(index)}
                        variant={addedItems.has(index) ? "secondary" : "default"}
                        size="sm"
                        className="w-full mt-3"
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
    </>
  )
}
