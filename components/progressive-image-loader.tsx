"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { preloadImage, isSlowConnection, getConnectionType } from "@/lib/image-optimization"

interface ProgressiveImageLoaderProps {
  images: string[]
  onProgress?: (loaded: number, total: number) => void
  onComplete?: () => void
  maxConcurrent?: number
}

export function ProgressiveImageLoader({ images, onProgress, onComplete, maxConcurrent }: ProgressiveImageLoaderProps) {
  const [loadedCount, setLoadedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const activeLoadsRef = useRef(0)

  // Определяем максимальное количество одновременных загрузок
  const getMaxConcurrent = useCallback(() => {
    if (maxConcurrent) return maxConcurrent

    const connectionType = getConnectionType()
    switch (connectionType) {
      case "slow":
        return 1
      case "2g":
        return 2
      case "3g":
        return 3
      case "4g":
        return 4
      case "wifi":
        return 6
      default:
        return 3
    }
  }, [maxConcurrent])

  const loadNextImage = useCallback(async () => {
    if (queueRef.current.length === 0 || activeLoadsRef.current >= getMaxConcurrent()) {
      return
    }

    const imageUrl = queueRef.current.shift()
    if (!imageUrl) return

    activeLoadsRef.current++

    try {
      // Добавляем таймаут в зависимости от типа соединения
      const connectionType = getConnectionType()
      const timeout =
        connectionType === "slow" ? 20000 : connectionType === "2g" ? 15000 : connectionType === "3g" ? 10000 : 8000

      await preloadImage(imageUrl, timeout)

      setLoadedCount((prev) => {
        const newCount = prev + 1
        onProgress?.(newCount, images.length)
        return newCount
      })
    } catch (error) {
      console.warn(`Failed to preload image: ${imageUrl}`, error)
      setFailedCount((prev) => prev + 1)
    } finally {
      activeLoadsRef.current--

      // Запускаем загрузку следующего изображения
      setTimeout(
        () => {
          loadNextImage()
        },
        isSlowConnection() ? 500 : 100,
      )
    }
  }, [images.length, onProgress, getMaxConcurrent])

  const startLoading = useCallback(() => {
    if (loadingRef.current || images.length === 0) return

    loadingRef.current = true
    setIsLoading(true)
    setLoadedCount(0)
    setFailedCount(0)

    queueRef.current = [...images]
    activeLoadsRef.current = 0

    // Запускаем несколько параллельных загрузок
    const maxConcurrent = getMaxConcurrent()
    for (let i = 0; i < Math.min(maxConcurrent, images.length); i++) {
      loadNextImage()
    }
  }, [images, loadNextImage, getMaxConcurrent])

  useEffect(() => {
    startLoading()
  }, [startLoading])

  useEffect(() => {
    const totalProcessed = loadedCount + failedCount
    if (totalProcessed === images.length && totalProcessed > 0) {
      setIsLoading(false)
      loadingRef.current = false
      onComplete?.()
    }
  }, [loadedCount, failedCount, images.length, onComplete])

  const progress = images.length > 0 ? (loadedCount / images.length) * 100 : 0
  const connectionType = getConnectionType()

  if (!isLoading && loadedCount === 0) return null

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 max-w-xs z-50">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          {isLoading ? (
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">
            {isLoading ? "Загрузка изображений..." : "Загрузка завершена"}
          </div>
          <div className="text-xs text-gray-500">
            {loadedCount} из {images.length} • {connectionType}
            {failedCount > 0 && ` • ${failedCount} ошибок`}
          </div>

          {/* Прогресс-бар */}
          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
