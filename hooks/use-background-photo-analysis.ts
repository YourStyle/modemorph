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

        // Обновляем статус сессии на "analyzing"
        aiAnalysis.updateSession(sessionId, {
          status: "analyzing",
          progress: 0,
          progressText: "Начинаем анализ..."
        })
      }

      // Создаём задачу
      const taskId = addTask({
        type: "photo_analysis",
        status: "processing",
        progress: 0,
        data: { sessionId },
      })

      // Функция нелинейного изменения прогресса (easing) - быстрее в начале, медленнее в конце
      const easeOutCubic = (t: number): number => {
        return 1 - Math.pow(1 - t, 3)
      }

      // Единый таймер для прогресса: от 0 до 95% за 2 минуты
      const PROGRESS_DURATION = 120000 // 2 минуты
      const startTime = Date.now()
      let progressCompleted = false

      const updateProgress = () => {
        if (progressCompleted) return

        const elapsed = Date.now() - startTime
        const linearProgress = Math.min(elapsed / PROGRESS_DURATION, 1) // 0 to 1
        const easedProgress = easeOutCubic(linearProgress) * 95 // 0 to 95%

        // Обновляем и задачу, и сессию одновременно
        updateTask(taskId, { progress: easedProgress })
        if (sessionId) {
          aiAnalysis.updateSession(sessionId, {
            progress: easedProgress,
            progressText: `Анализируем ${files.length} фото...`,
          })
        }
      }

      // Запускаем таймер обновления прогресса каждые 100мс
      const progressTimer = setInterval(updateProgress, 100)

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

        // Анализируем каждое фото напрямую через AI API (с таймаутом)
        const FETCH_TIMEOUT_MS = 150_000 // 2.5 минуты
        const analysisPromises = files.map(async (file) => {
          const formData = new FormData()
          formData.append("image", file)

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

          try {
            const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
              method: "POST",
              body: formData,
              signal: controller.signal,
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
            })

            clearTimeout(timeoutId)

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
            clearTimeout(timeoutId)
            const message = error instanceof DOMException && error.name === "AbortError"
              ? "Превышено время ожидания ответа от AI. Попробуйте позже."
              : error instanceof Error ? error.message : "Unknown error"
            console.error("Error analyzing photo:", message)
            return { success: false, error: message }
          }
        })

        const results = await Promise.all(analysisPromises)

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

        // Проверяем, есть ли items в результате
        if (allItems.length === 0) {
          throw new Error(errors[0] || "Не удалось найти вещи на фото")
        }

        // Images will be uploaded to S3 when the user saves the item, not during analysis
        const itemsWithImages = allItems.map(item => ({
          ...item,
          finalImageUrl: item.image_url || item.img_url
        }))

        clearInterval(progressTimer)
        progressCompleted = true

        // IMPORTANT: Call onComplete BEFORE updating session status to "completed",
        // because photo-analysis-form.tsx polls session status every 100ms and will
        // stop loading when it sees "completed" — we must deliver results first.
        if (onComplete) {
          onComplete({ items: itemsWithImages })
        }

        updateTask(taskId, {
          status: "completed",
          progress: 100,
          data: {
            items: itemsWithImages,
            itemsCount: itemsWithImages.length,
            sessionId,
          },
        })

        if (sessionId) {
          aiAnalysis.updateSession(sessionId, {
            status: "completed",
            items: itemsWithImages,
            progress: 100,
            progressText: "Готово!",
          })
        }

        return { success: true, taskId, result: { items: itemsWithImages } }
      } catch (error) {
        // Останавливаем таймер прогресса при ошибке
        clearInterval(progressTimer)
        progressCompleted = true

        const errorMessage = error instanceof Error ? error.message : "Произошла ошибка при анализе"

        updateTask(taskId, {
          status: "error",
          error: errorMessage,
        })

        if (sessionId) {
          aiAnalysis.updateSession(sessionId, {
            status: "error",
            error: errorMessage,
          })
        }

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
