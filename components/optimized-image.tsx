"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  createOptimizedImageUrl,
  createImageSrcSet,
  createImageSizes,
  getOptimalImageSize,
  isSlowConnection,
} from "@/lib/image-optimization"

interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
  priority?: boolean
  placeholder?: "blur" | "empty"
  blurDataURL?: string
  onLoad?: () => void
  onError?: () => void
}

export function OptimizedImage({
  src,
  alt,
  className,
  width = 300,
  height = 300,
  priority = false,
  placeholder = "blur",
  blurDataURL,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [imageSrc, setImageSrc] = useState("")

  useEffect(() => {
    if (!src) {
      setHasError(true)
      return
    }

    // Определяем оптимальный размер изображения
    const optimalSize = getOptimalImageSize()
    const optimizedSrc = createOptimizedImageUrl(src, optimalSize)
    setImageSrc(optimizedSrc)
  }, [src])

  const handleLoad = () => {
    setIsLoading(false)
    onLoad?.()
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
    onError?.()
  }

  // Создаем placeholder для медленного соединения
  const defaultBlurDataURL =
    blurDataURL ||
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="

  if (hasError) {
    return (
      <div
        className={cn("flex items-center justify-center bg-gray-100 text-gray-400 text-sm", className)}
        style={{ width, height }}
      >
        Изображение недоступно
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Показываем скелетон во время загрузки */}
      {isLoading && <div className="absolute inset-0 bg-gray-200 animate-pulse" style={{ width, height }} />}

      {imageSrc && (
        <Image
          src={imageSrc || "/placeholder.svg"}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          placeholder={placeholder}
          blurDataURL={defaultBlurDataURL}
          className={cn("transition-opacity duration-300", isLoading ? "opacity-0" : "opacity-100")}
          style={{
            objectFit: "cover",
            width: "100%",
            height: "100%",
          }}
          // Для адаптивных изображений на медленном соединении
          srcSet={isSlowConnection() ? undefined : createImageSrcSet(src)}
          sizes={isSlowConnection() ? undefined : createImageSizes()}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
        />
      )}
    </div>
  )
}
