"use client"

import { useBackgroundTasks } from "@/contexts/background-tasks-context"
import { useAIAnalysis } from "@/contexts/ai-analysis-context"
import { useCallback } from "react"

interface PhotoAnalysisOptions {
  files: File[]
  batchId?: string
  onComplete?: (result: any) => void
  onError?: (error: string) => void
}

export function useBackgroundPhotoAnalysis() {
  const { addTask, updateTask } = useBackgroundTasks()
  const aiAnalysis = useAIAnalysis()

  const startAnalysis = useCallback(
    async ({ files, batchId, onComplete, onError }: PhotoAnalysisOptions) => {
      // Проверяем, есть ли уже активная сессия с этим batchId
      const existingSession = batchId ? aiAnalysis.getSessionByBatchId(batchId) : null

      if (existingSession && existingSession.status === "analyzing") {
        // Сессия уже существует и анализ идет - просто создаем background task для отслеживания
        console.log("[useBackgroundPhotoAnalysis] Found active session, attaching to it:", existingSession.id)

        const taskId = addTask({
          type: "photo_analysis",
          status: "processing",
          progress: existingSession.progress,
          data: { sessionId: existingSession.id },
        })

        // Отслеживаем прогресс сессии и обновляем task
        const checkInterval = setInterval(() => {
          const session = aiAnalysis.getSession(existingSession.id)
          if (!session) {
            clearInterval(checkInterval)
            return
          }

          updateTask(taskId, { progress: session.progress })

          if (session.status === "completed") {
            clearInterval(checkInterval)
            updateTask(taskId, {
              status: "completed",
              progress: 100,
              data: {
                items: session.items,
                itemsCount: session.items.length,
                sessionId: session.id,
              },
            })
            if (onComplete) {
              onComplete({ items: session.items })
            }
          } else if (session.status === "error") {
            clearInterval(checkInterval)
            updateTask(taskId, {
              status: "error",
              error: session.error || "Ошибка анализа",
            })
            if (onError) {
              onError(session.error || "Ошибка анализа")
            }
          }
        }, 500)

        return { success: true, taskId, result: { items: existingSession.items } }
      }

      // Нет активной сессии - создаём новую
      let sessionId: string | null = null
      if (batchId) {
        const photos = files.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          id: Math.random().toString(36).substr(2, 9),
        }))
        sessionId = aiAnalysis.createSession(batchId, photos)
        console.log("[useBackgroundPhotoAnalysis] Created new AI analysis session:", sessionId)
      }

      // Создаём задачу
      const taskId = addTask({
        type: "photo_analysis",
        status: "processing",
        progress: 0,
        data: { sessionId },
      })

      // Функция нелинейного изменения прогресса (easing)
      const easeOutQuad = (t: number): number => {
        return 1 - Math.pow(1 - t, 3) // Cubic easing out - быстрее в начале, медленнее в конце
      }

      try {
        // Примечание: лимиты УЖЕ проверены в photo-analysis-form.tsx перед началом анализа
        // Здесь просто продолжаем анализ в фоновом режиме после сворачивания шторки

        // Получаем токен авторизации
        const { sessionAuth } = await import("@/lib/tma/session-auth")
        const accessToken = sessionAuth.getAccessToken()

        if (!accessToken) {
          throw new Error("No access token available")
        }

        // AI API URL
        const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"

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

        // Анализируем каждое фото напрямую через AI API
        const analysisPromises = files.map(async (file) => {
          const formData = new FormData()
          formData.append("image", file)

          try {
            const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
              method: "POST",
              body: formData,
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
            })

            if (!response.ok) {
              throw new Error(`AI API error: ${response.status}`)
            }

            const data = await response.json()

            // Проверяем на rejection
            if (Array.isArray(data) && data.length > 0 && data[0].acceptable === false) {
              return { success: false, error: data[0].reason, isRejection: true }
            }

            return { success: true, data }
          } catch (error) {
            console.error("Error analyzing photo:", error)
            return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
          }
        })

        const results = await Promise.all(analysisPromises)

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

        // Собираем все успешные результаты
        const allItems: any[] = []
        const errors: string[] = []

        for (const result of results) {
          if (result.success && Array.isArray(result.data)) {
            allItems.push(...result.data)
          } else if (!result.success && result.error) {
            errors.push(result.error)
          }
        }

        clearInterval(midProgressInterval)

        // Проверяем, есть ли items в результате
        if (allItems.length === 0) {
          throw new Error(errors[0] || "Не удалось найти вещи на фото")
        }

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
                items: allItems,
                itemsCount: allItems.length,
                sessionId,
              },
            })

            // Обновляем сессию AI анализа
            if (sessionId) {
              aiAnalysis.updateSession(sessionId, {
                status: "completed",
                items: allItems,
                progress: 100,
                progressText: "Готово!",
              })
            }

            if (onComplete) {
              onComplete({ items: allItems })
            }
          }, 300)
        }, 500)

        return { success: true, taskId, result: { items: allItems } }
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
    [addTask, updateTask, aiAnalysis]
  )

  return { startAnalysis }
}
