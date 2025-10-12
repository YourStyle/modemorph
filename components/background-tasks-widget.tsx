"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { X, CheckCircle2, Loader2, AlertCircle, Shirt } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

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

  // Показываем tooltip когда задача завершена
  useEffect(() => {
    tasks.forEach((task) => {
      if (task.status === "completed" && !showTooltip) {
        setShowTooltip(task.id)
        // Скрываем tooltip через 5 секунд
        setTimeout(() => {
          setShowTooltip((current) => (current === task.id ? null : current))
        }, 5000)
      }
    })
  }, [tasks, showTooltip])

  const activeTasks = tasks.filter((task) => task.status !== "error" || Date.now() - task.startedAt.getTime() < 10000)

  if (activeTasks.length === 0) return null

  return (
    <div className="fixed bottom-24 right-4 z-50 space-y-3">
      {activeTasks.map((task) => {
        const isCompleted = task.status === "completed"
        const isError = task.status === "error"
        const showCompletedTooltip = showTooltip === task.id && isCompleted

        return (
          <div key={task.id} className="relative">
            {/* Компактный круглый виджет */}
            <div
              className={cn(
                "relative w-16 h-16 rounded-full shadow-xl backdrop-blur-sm transition-all duration-300",
                isCompleted && "bg-green-500",
                isError && "bg-red-500",
                !isCompleted && !isError && "bg-white"
              )}
            >
              {/* Круговой прогресс */}
              {task.status === "processing" && (
                <div className="absolute inset-0">
                  <CircularProgress progress={task.progress} size={64} />
                </div>
              )}

              {/* Иконка в центре */}
              <div className="absolute inset-0 flex items-center justify-center">
                {task.status === "processing" && (
                  <Shirt className="w-6 h-6 text-blue-600" />
                )}
                {isCompleted && <CheckCircle2 className="w-7 h-7 text-white" />}
                {isError && <AlertCircle className="w-7 h-7 text-white" />}
              </div>

              {/* Цифра прогресса */}
              {task.status === "processing" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-gray-700 mt-6">
                    {Math.round(task.progress)}%
                  </span>
                </div>
              )}

              {/* Кнопка закрытия */}
              <button
                onClick={() => removeTask(task.id)}
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
  )
}
