"use client"

import { useState, useEffect } from "react"
import { preloadImage } from "@/lib/image-optimization"

interface ProgressiveImageLoaderProps {
  images: string[]
  onImagesLoaded?: (loadedCount: number) => void
  maxConcurrent?: number
}

export function ProgressiveImageLoader({ images, onImagesLoaded, maxConcurrent = 3 }: ProgressiveImageLoaderProps) {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set())
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  useEffect(() => {
    let currentIndex = 0
    let activeLoads = 0

    const loadNextBatch = async () => {
      while (activeLoads < maxConcurrent && currentIndex < images.length) {
        const imageUrl = images[currentIndex]
        currentIndex++

        if (loadedImages.has(imageUrl) || failedImages.has(imageUrl)) {
          continue
        }

        activeLoads++
        setLoadingImages((prev) => new Set([...prev, imageUrl]))

        try {
          await preloadImage(imageUrl)
          setLoadedImages((prev) => new Set([...prev, imageUrl]))
        } catch (error) {
          console.warn(`Failed to preload image: ${imageUrl}`)
          setFailedImages((prev) => new Set([...prev, imageUrl]))
        } finally {
          activeLoads--
          setLoadingImages((prev) => {
            const newSet = new Set(prev)
            newSet.delete(imageUrl)
            return newSet
          })

          // Загружаем следующую порцию
          loadNextBatch()
        }
      }
    }

    loadNextBatch()
  }, [images, maxConcurrent, loadedImages, failedImages])

  useEffect(() => {
    onImagesLoaded?.(loadedImages.size)
  }, [loadedImages.size, onImagesLoaded])

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-3 text-sm">
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span>
          Загружено: {loadedImages.size}/{images.length}
        </span>
      </div>

      {loadingImages.size > 0 && <div className="mt-1 text-xs text-gray-500">Загружается: {loadingImages.size}</div>}

      {failedImages.size > 0 && <div className="mt-1 text-xs text-red-500">Ошибок: {failedImages.size}</div>}
    </div>
  )
}
