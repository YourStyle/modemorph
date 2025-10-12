"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { X, CheckCircle2, Loader2, AlertCircle, Shirt } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

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
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<any>(null)
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
    if (task.status === "completed" && task.data?.items) {
      setSelectedTask(task)
      setShowResultsModal(true)
    }
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
              className={cn(
                "relative w-16 h-16 rounded-full shadow-xl transition-all duration-300 cursor-pointer hover:scale-105",
                isCompleted && "bg-green-500",
                isError && "bg-red-500"
              )}
              style={{
                background: !isCompleted && !isError
                  ? 'rgba(255, 255, 255, 0.85)'
                  : undefined,
                backdropFilter: !isCompleted && !isError ? 'blur(20px) saturate(180%)' : undefined,
                WebkitBackdropFilter: !isCompleted && !isError ? 'blur(20px) saturate(180%)' : undefined,
                boxShadow: !isCompleted && !isError
                  ? '0 8px 32px 0 rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)'
                  : undefined,
                border: !isCompleted && !isError ? '1px solid rgba(255, 255, 255, 0.18)' : undefined,
              }}
            >
              {/* Gradient overlay для liquid glass эффекта */}
              {!isCompleted && !isError && (
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
                  }}
                />
              )}
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
                    <span className="text-[9px] font-bold text-gray-700 mt-0.5">
                      {Math.round(task.progress)}%
                    </span>
                  </>
                )}
                {isCompleted && <CheckCircle2 className="w-7 h-7 text-white" />}
                {isError && <AlertCircle className="w-7 h-7 text-white" />}
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

      {/* Модальное окно с результатами */}
      <Dialog open={showResultsModal} onOpenChange={setShowResultsModal}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Результаты анализа</DialogTitle>
            <DialogDescription>
              {selectedTask?.data?.itemsCount
                ? `Найдено ${selectedTask.data.itemsCount} ${selectedTask.data.itemsCount === 1 ? "вещь" : "вещей"}`
                : "Результаты анализа фотографий"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedTask?.data?.items?.map((item: any, index: number) => (
              <Card key={index} className="p-4">
                <div className="flex gap-3">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.item_name || item.name}
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{item.item_name || item.name}</h4>
                    {item.material && (
                      <p className="text-xs text-gray-600 mt-1">Материал: {item.material}</p>
                    )}
                    {item.color && (
                      <p className="text-xs text-gray-600">Цвет: {item.color}</p>
                    )}
                    {item.style && (
                      <p className="text-xs text-gray-600">Стиль: {item.style}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
