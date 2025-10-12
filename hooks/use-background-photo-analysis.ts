"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { useCallback } from "react"

interface PhotoAnalysisOptions {
  files: File[]
  onComplete?: (result: any) => void
  onError?: (error: string) => void
}

export function useBackgroundPhotoAnalysis() {
  const { addTask, updateTask } = useBackgroundTasks()

  const startAnalysis = useCallback(
    async ({ files, onComplete, onError }: PhotoAnalysisOptions) => {
      // Создаём задачу
      const taskId = addTask({
        type: "photo_analysis",
        status: "processing",
        progress: 0,
      })

      try {
        // Подготавливаем FormData
        const formData = new FormData()
        files.forEach((file) => {
          formData.append("files", file)
        })

        // Обновляем прогресс
        updateTask(taskId, { progress: 20 })

        // Отправляем запрос
        const response = await fetch("/api/analyze-photos", {
          method: "POST",
          body: formData,
        })

        updateTask(taskId, { progress: 60 })

        if (!response.ok) {
          throw new Error("Failed to analyze photos")
        }

        const result = await response.json()

        updateTask(taskId, { progress: 100 })

        // Небольшая задержка перед завершением для плавности
        setTimeout(() => {
          updateTask(taskId, {
            status: "completed",
            data: {
              items: result.items || [],
              itemsCount: result.items?.length || 0,
            },
          })

          if (onComplete) {
            onComplete(result)
          }
        }, 500)

        return { success: true, taskId, result }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Произошла ошибка при анализе"

        updateTask(taskId, {
          status: "error",
          error: errorMessage,
        })

        if (onError) {
          onError(errorMessage)
        }

        return { success: false, taskId, error: errorMessage }
      }
    },
    [addTask, updateTask]
  )

  return { startAnalysis }
}
