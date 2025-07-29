"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { getConnectionType, isRussianUser } from "@/lib/image-optimization"

interface ProgressiveImageLoaderProps {
  images: string[]
  onImageLoaded?: (url: string, index: number) => void
  onAllLoaded?: () => void
  onError?: (url: string, error: Error) => void
  maxConcurrent?: number
  children: (loadedImages: Set<string>, isLoading: boolean, progress: number) => React.ReactNode
}

export function ProgressiveImageLoader({
  images,
  onImageLoaded,
  onAllLoaded,
  onError,
  maxConcurrent,
  children,
}: ProgressiveImageLoaderProps) {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const loadingQueue = useRef<string[]>([])
  const activeLoads = useRef<Set<string>>(new Set())

  // Определяем максимальное количество одновременных загрузок
  const getConcurrentLimit = () => {
    if (maxConcurrent) return maxConcurrent

    const connectionType = getConnectionType()
    const isRussian = isRussianUser()

    // Для российских пользователей используем более консервативные лимиты
    if (isRussian) {
      if (connectionType === "slow") return 1
      if (connectionType === "2g") return 2
      if (connectionType === "3g") return 2
      return 3
    }

    // Для других пользователей
    if (connectionType === "slow") return 1
    if (connectionType === "2g") return 2
    if (connectionType === "3g") return 3
    return 4
  }

  const loadImage = async (url: string, index: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image()

      // Увеличиваем таймаут для российских пользователей
      const timeout = isRussianUser() ? 15000 : 10000
      const timer = setTimeout(() => {
        reject(new Error(`Image load timeout: ${url}`))
      }, timeout)

      img.onload = () => {
        clearTimeout(timer)
        setLoadedImages((prev) => new Set([...prev, url]))
        setProgress((prev) => Math.min(100, (prev * images.length + 100) / images.length))
        onImageLoaded?.(url, index)
        resolve()
      }

      img.onerror = () => {
        clearTimeout(timer)
        const error = new Error(`Failed to load image: ${url}`)
        onError?.(url, error)
        reject(error)
      }

      img.src = url
    })
  }

  const processQueue = async () => {
    const concurrentLimit = getConcurrentLimit()

    while (loadingQueue.current.length > 0 && activeLoads.current.size < concurrentLimit) {
      const url = loadingQueue.current.shift()
      if (!url) continue

      activeLoads.current.add(url)
      const index = images.indexOf(url)

      try {
        await loadImage(url, index)
      } catch (error) {
        console.warn(`Failed to load image: ${url}`, error)
      } finally {
        activeLoads.current.delete(url)

        // Продолжаем обработку очереди
        if (loadingQueue.current.length > 0) {
          processQueue()
        }
      }
    }

    // Проверяем, завершена ли загрузка
    if (loadingQueue.current.length === 0 && activeLoads.current.size === 0) {
      setIsLoading(false)
      onAllLoaded?.()
    }
  }

  useEffect(() => {
    if (images.length === 0) {
      setIsLoading(false)
      return
    }

    // Инициализируем очередь загрузки
    loadingQueue.current = [...images]
    setLoadedImages(new Set())
    setProgress(0)
    setIsLoading(true)

    // Запускаем загрузку
    processQueue()
  }, [images])

  return <>{children(loadedImages, isLoading, progress)}</>
}
