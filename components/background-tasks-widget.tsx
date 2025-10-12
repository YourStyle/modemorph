"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { X, CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

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
    <div className="fixed bottom-24 right-4 z-40 space-y-2 max-w-sm">
      {activeTasks.map((task) => {
        const isCompleted = task.status === "completed"
        const isError = task.status === "error"
        const showCompletedTooltip = showTooltip === task.id && isCompleted

        return (
          <div key={task.id} className="relative">
            <Card
              className={cn(
                "p-4 shadow-xl border backdrop-blur-sm transition-all duration-300",
                isCompleted && "bg-green-50/90 border-green-200",
                isError && "bg-red-50/90 border-red-200",
                !isCompleted && !isError && "bg-white/90"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {task.status === "processing" && (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  )}
                  {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {isError && <AlertCircle className="h-5 w-5 text-red-600" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {task.type === "photo_analysis" && "Анализ фотографий"}
                      </h4>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {task.status === "processing" && "Обрабатываем ваши фото..."}
                        {isCompleted && "Анализ завершён!"}
                        {isError && (task.error || "Произошла ошибка")}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTask(task.id)}
                      className="h-6 w-6 p-0 hover:bg-gray-200"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {task.status === "processing" && (
                    <div className="mt-3">
                      <Progress value={task.progress} className="h-2" />
                      <p className="text-xs text-gray-500 mt-1">{Math.round(task.progress)}%</p>
                    </div>
                  )}

                  {isCompleted && task.data?.itemsCount && (
                    <p className="text-xs text-green-700 mt-2 font-medium">
                      Добавлено {task.data.itemsCount} {task.data.itemsCount === 1 ? "вещь" : "вещей"}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Tooltip для завершённой задачи */}
            {showCompletedTooltip && (
              <div className="absolute -top-12 right-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg">
                  Анализ завершён
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
