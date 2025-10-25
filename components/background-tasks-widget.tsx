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
import FallingObjectsGame from "@/components/falling-objects-game"
import QuoteCard from "@/components/quote-card"

type ViewMode = "choose" | "quotes" | "game" | null

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const GameShell: React.FC<React.PropsWithChildren<{ height: number }>> = ({ children, height }) => (
  <div
    className="w-full rounded-xl border border-white/10 bg-white/5 flex items-center justify-center"
    style={{ height: `${height}px` }}
  >
    {children}
  </div>
)

const ProgressBlock: React.FC<{ progress: number; progressText: string }> = ({ progress, progressText }) => (
  <div className="w-full max-w-sm mx-auto mt-4">
    <div className="relative h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-[width] duration-200"
        style={{ width: `${progress}%` }}
      />
    </div>
    <div className="flex justify-between text-xs mt-2 text-neutral-400">
      <span>{progressText}</span>
      <span>{Math.round(progress)}%</span>
    </div>
  </div>
)

type LoadingExperienceProps = {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  gameHeight: number
  quotes: { text: string; author: string }[]
  quoteIndex: number
  progress: number
  progressText: string
}

const LoadingExperience: React.FC<LoadingExperienceProps> = ({
  viewMode,
  setViewMode,
  gameHeight,
  quotes,
  quoteIndex,
  progress,
  progressText,
}) => {
  const pickGame = () => setViewMode("game")
  const pickQuotes = () => setViewMode("quotes")

  if (viewMode === null || viewMode === "choose") {
    return (
      <>
        <GameShell height={gameHeight}>
          <div className="w-full px-4 sm:px-6 max-w-2xl mx-auto text-center select-none" style={{ touchAction: "manipulation" }}>
            <p className="text-sm text-neutral-300 mb-3">Пока ИИ работает, выберите, что показать:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button className="h-11 rounded-2xl bg-[#292929] text-white px-4" onPointerUp={pickGame}>
                Сыграть в игру
              </button>
              <button className="h-11 rounded-2xl border px-4 text-[#101010]" onPointerUp={pickQuotes}>
                Посмотреть цитаты
              </button>
            </div>
          </div>
        </GameShell>
        <ProgressBlock progress={progress} progressText={progressText} />
      </>
    )
  }

  if (viewMode === "quotes") {
    return (
      <>
        <GameShell height={gameHeight}>
          <div className="text-center max-w-md w-full">
            <h2 className="text-lg font-semibold mb-2 text-white">ИИ анализирует ваши фото</h2>
            <QuoteCard className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center shadow mx-4">
              <p className="italic text-black">"{quotes[quoteIndex].text}"</p>
              <p className="mt-2 font-medium text-black">— {quotes[quoteIndex].author}</p>
            </QuoteCard>
            <p className="mt-3 text-xs text-neutral-400">Можно переключиться на игру в любой момент</p>
            <div className="mt-3">
              <button className="border rounded-2xl px-3 py-1 text-[#101010]" onPointerUp={pickGame}>
                Переключиться на игру
              </button>
            </div>
          </div>
        </GameShell>
        <ProgressBlock progress={progress} progressText={progressText} />
      </>
    )
  }

  // game
  return (
    <>
      <GameShell height={gameHeight}>
        <FallingObjectsGame
          analysisDone={progress >= 100}
          onRequestFinish={() => setViewMode(null)}
          onRequestReturnToPicker={() => setViewMode("choose")}
        />
      </GameShell>
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
  const [showProgressSheet, setShowProgressSheet] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [addingItems, setAddingItems] = useState<Set<number>>(new Set())
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set())
  const shownTooltipsRef = useRef<Set<string>>(new Set())

  // States for LoadingExperience
  const [viewMode, setViewMode] = useState<ViewMode>(null)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const quoteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const GAME_AREA_HEIGHT = 300

  const quotes = [
    { text: "Мода проходит, стиль остаётся", author: "Коко Шанель" },
    { text: "Мода проходит, стиль вечен", author: "Ив Сен-Лоран" },
    { text: "Элегантность — это не быть замеченным, а быть запомненным", author: "Джорджио Армани" },
    { text: "То, что вы носите, — это то, как вы представляете себя миру… Мода — мгновенный язык", author: "Миучча Прада" },
    { text: "Не гонитесь за трендами. Не позволяйте моде владеть вами, решайте сами, кто вы и что хотите выразить своим обликом", author: "Джанни Версаче" },
    { text: "Счастье — секрет любой красоты. Нет красоты привлекательной без счастья", author: "Кристиан Диор" },
    { text: "Стиль — очень личное. Он не связан с модой. Мода быстро проходит. Стиль — навсегда", author: "Ральф Лорен" },
    { text: "Хорошо одеваться — это форма хороших манер", author: "Том Форд" },
    { text: "Стиль — это способ сказать, кто вы, не произнося ни слова", author: "Рейчел Зои" },
  ]
  const [shuffledQuotes, setShuffledQuotes] = useState(() => shuffleArray(quotes))

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
          console.log("[BackgroundTasksWidget] Opening progress sheet for processing task")
          setSelectedSessionId(task.data.sessionId)
          setShowProgressSheet(true)
          if (!viewMode) setViewMode("choose")
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

  // Rotate quotes every 10 seconds while progress sheet is open
  useEffect(() => {
    if (showProgressSheet) {
      const newOrder = shuffleArray(quotes)
      setShuffledQuotes(newOrder)
      setQuoteIndex(0)
      quoteTimerRef.current = setInterval(() => {
        setQuoteIndex((prev) => (prev + 1) % newOrder.length)
      }, 10000)
    } else {
      if (quoteTimerRef.current) {
        clearInterval(quoteTimerRef.current)
        quoteTimerRef.current = null
      }
      setQuoteIndex(0)
    }
    return () => {
      if (quoteTimerRef.current) {
        clearInterval(quoteTimerRef.current)
        quoteTimerRef.current = null
      }
    }
  }, [showProgressSheet])

  // Automatically open progress sheet when a new processing task is created
  const prevTasksRef = useRef<typeof tasks>([])
  useEffect(() => {
    const newProcessingTasks = tasks.filter(
      (task) =>
        task.status === "processing" &&
        !prevTasksRef.current.find((prevTask) => prevTask.id === task.id)
    )

    if (newProcessingTasks.length > 0 && !showProgressSheet && !showResultsSheet) {
      // New processing task detected - auto-open progress sheet
      const firstTask = newProcessingTasks[0]
      console.log("[BackgroundTasksWidget] Auto-opening progress sheet for new task:", firstTask.id)
      setSelectedSessionId(firstTask.data.sessionId)
      setShowProgressSheet(true)
      if (!viewMode) setViewMode("choose")
    }

    prevTasksRef.current = tasks
  }, [tasks, showProgressSheet, showResultsSheet, viewMode])

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

              return (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-[#101010] mb-2">Результаты анализа</h2>
                    <p className="text-[#101010] text-sm">
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
                      <div className="relative w-24 h-24 flex-shrink-0">
                        <Image
                          src={item.finalImageUrl || item.image_url || item.img_url}
                          alt={item.item_name || item.name}
                          fill
                          className="rounded-md object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-white/10 rounded-md flex items-center justify-center text-3xl">
                        👕
                      </div>
                    )}

                    {/* Информация */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-[#101010] text-base">
                            {item.item_name || item.name}
                          </h3>
                          {item.basic_item_id && (
                            <Badge className="mt-1 bg-blue-500/20 text-blue-300 border-blue-500/30">
                              Базовая
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-sm text-[#C9C9C9] space-y-1">
                        {item.material && (
                          <p>Материал: <span className="text-[#101010]">{item.material}</span></p>
                        )}
                        {item.color && (
                          <p>Цвет: <span className="text-[#101010]">{item.color}</span></p>
                        )}
                        {item.shade && (
                          <p>Оттенок: <span className="text-[#101010]">{item.shade}</span></p>
                        )}
                        {item.style && (
                          <p>Стиль: <span className="text-[#101010]">{item.style}</span></p>
                        )}
                      </div>

                      {/* Кнопка добавления */}
                      <Button
                        onClick={() => handleAddItem(item, index)}
                        disabled={addingItems.has(index) || addedItems.has(index)}
                        variant={addedItems.has(index) ? "secondary" : "default"}
                        size="sm"
                        className="w-full mt-3 rounded-2xl"
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
          setViewMode(null)
        }}
        backgroundColor="dark"
        onMinimize={() => setShowProgressSheet(false)}
      >
        <div className="h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-2 pb-20 pb-safe">
          {(() => {
            const session = selectedSessionId ? aiAnalysis.getSession(selectedSessionId) : null
            const progress = session?.progress || 0
            const progressText = session?.progressText || "Анализируем..."

            return (
              <div className="text-neutral-100">
                <LoadingExperience
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  gameHeight={GAME_AREA_HEIGHT}
                  quotes={shuffledQuotes}
                  quoteIndex={quoteIndex}
                  progress={progress}
                  progressText={progressText}
                />
              </div>
            )
          })()}
        </div>
      </CommonSheet>
    </>
  )
}
