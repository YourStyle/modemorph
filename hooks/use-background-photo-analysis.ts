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

      // Функция нелинейного изменения прогресса (easing)
      const easeOutQuad = (t: number): number => {
        return 1 - Math.pow(1 - t, 3) // Cubic easing out - быстрее в начале, медленнее в конце
      }

      try {
        // Подготавливаем FormData
        const formData = new FormData()
        files.forEach((file) => {
          formData.append("files", file)
        })

        // Симулируем плавный прогресс до 20%
        let currentProgress = 0
        const progressInterval = setInterval(() => {
          currentProgress += 1
          const easedProgress = easeOutQuad(currentProgress / 20) * 20
          updateTask(taskId, { progress: Math.min(easedProgress, 20) })
          if (currentProgress >= 20) {
            clearInterval(progressInterval)
          }
        }, 100)

        // Отправляем запрос
        const response = await fetch("/api/analyze-photos", {
          method: "POST",
          body: formData,
        })

        clearInterval(progressInterval)

        // Плавный переход 20% -> 60%
        currentProgress = 20
        const midProgressInterval = setInterval(() => {
          currentProgress += 1
          const normalized = (currentProgress - 20) / 40 // 0 to 1
          const easedProgress = 20 + easeOutQuad(normalized) * 40
          updateTask(taskId, { progress: Math.min(easedProgress, 60) })
          if (currentProgress >= 60) {
            clearInterval(midProgressInterval)
          }
        }, 50)

        if (!response.ok) {
          clearInterval(midProgressInterval)
          throw new Error("Failed to analyze photos")
        }

        const result = await response.json()

        clearInterval(midProgressInterval)

        // Плавный переход 60% -> 95%
        currentProgress = 60
        const finalProgressInterval = setInterval(() => {
          currentProgress += 1
          const normalized = (currentProgress - 60) / 35 // 0 to 1
          const easedProgress = 60 + easeOutQuad(normalized) * 35
          updateTask(taskId, { progress: Math.min(easedProgress, 95) })
          if (currentProgress >= 95) {
            clearInterval(finalProgressInterval)
          }
        }, 80)

        // Финальный скачок до 100%
        setTimeout(() => {
          clearInterval(finalProgressInterval)
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
          }, 300)
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
