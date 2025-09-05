"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  createOptimizedImageUrl,
  createImageSrcSet,
  createImageSizes,
  getOptimalImageSize,
  isSlowConnection,
  isVerySlowConnection,
  getConnectionType,
  isRussianUser,
  testImageAvailability,
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
  showConnectionInfo?: boolean
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
  showConnectionInfo = false,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [imageSrc, setImageSrc] = useState("")
  const [loadAttempts, setLoadAttempts] = useState(0)
  const [connectionType, setConnectionType] = useState<string>("")
  const [useProxy, setUseProxy] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!src) {
      setHasError(true)
      return
    }

    const connType = getConnectionType()
    setConnectionType(connType)

    // Для российских пользователей сначала пробуем без прокси
    const isRussian = isRussianUser()

    const initializeImage = async () => {
      // Определяем оптимальный размер изображения
      const optimalSize = getOptimalImageSize()

      // Сначала пробуем прямое подключение
      let optimizedSrc = createOptimizedImageUrl(src, optimalSize, false)

      // Для российских пользователей тестируем доступность
      if (isRussian && src.includes("blob.vercel-storage.com")) {
        const isAvailable = await testImageAvailability(optimizedSrc, 3000)

        if (!isAvailable) {
          console.log("Direct access failed, using proxy for:", src)
          setUseProxy(true)
          optimizedSrc = createOptimizedImageUrl(src, optimalSize, true)
        }
      }

      setImageSrc(optimizedSrc)

      // Устанавливаем таймаут для медленных соединений
      const timeout = connType === "slow" ? 20000 : connType === "2g" ? 15000 : 10000

      timeoutRef.current = setTimeout(() => {
        if (isLoading) {
          console.warn(`Image load timeout for: ${src}`)

          // Если еще не пробовали прокси, пробуем его
          if (isRussian && !useProxy && src.includes("blob.vercel-storage.com")) {
            console.log("Timeout reached, trying proxy for:", src)
            setUseProxy(true)
            const proxiedSrc = createOptimizedImageUrl(src, optimalSize, true)
            setImageSrc(proxiedSrc)
            setLoadAttempts((prev) => prev + 1)
            return
          }

          setHasError(true)
          setIsLoading(false)
        }
      }, timeout)
    }

    initializeImage()

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [src, isLoading])

  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsLoading(false)
    setHasError(false)
    onLoad?.()
  }

  const handleError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    setLoadAttempts((prev) => prev + 1)

    // Если это первая попытка и мы не используем прокси, пробуем прокси
    if (loadAttempts === 0 && !useProxy && isRussianUser() && src.includes("blob.vercel-storage.com")) {
      console.warn(`Direct image failed, trying proxy: ${src}`)
      setUseProxy(true)
      const proxiedSrc = createOptimizedImageUrl(src, getOptimalImageSize(), true)
      setImageSrc(proxiedSrc)
      return
    }

    // Если используем прокси и он не работает, пробуем оригинал
    if (loadAttempts === 1 && useProxy && imageSrc !== src) {
      console.warn(`Proxied image failed, trying original: ${src}`)
      setImageSrc(src)
      return
    }

    // Если все попытки неудачны, показываем ошибку
    console.error(`Failed to load image after ${loadAttempts + 1} attempts: ${src}`)
    setIsLoading(false)
    setHasError(true)
    onError?.()
  }

  // Создаем улучшенный blur placeholder
  const defaultBlurDataURL =
    blurDataURL ||
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="

  if (hasError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center bg-gray-100 text-gray-400 text-xs border border-gray-200 rounded",
          className,
        )}
        style={{ width, height }}
      >
        <div className="text-2xl mb-1">📷</div>
        <div className="text-center px-2">
          <div>Изображение</div>
          <div>недоступно</div>
        </div>
        {showConnectionInfo && (
          <div className="text-xs text-gray-300 mt-1">
            {connectionType} {useProxy ? "(proxy)" : "(direct)"}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden bg-gray-100", className)}>
      {/* Скелет��н во время загрузки */}
      {isLoading && (
        <div
          className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse"
          style={{ width, height }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-gray-400 text-xs">
              {isVerySlowConnection() ? "Загрузка..." : useProxy ? "Через прокси..." : "📷"}
            </div>
          </div>
        </div>
      )}

      {/* Индикатор соединения для отладки */}
      {showConnectionInfo && connectionType && (
        <div className="absolute top-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded z-10">
          {connectionType} {useProxy ? "P" : "D"}
        </div>
      )}

      {imageSrc && (
        <Image
          src={imageSrc || "/placeholder.svg"}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          placeholder={placeholder}
          blurDataURL={defaultBlurDataURL}
          className={cn("transition-opacity duration-500 object-cover", isLoading ? "opacity-0" : "opacity-100")}
          style={{
            width: "100%",
            height: "100%",
          }}
          // Для медленных соединений или при использовании прокси не используем srcSet
          srcSet={isSlowConnection() || useProxy ? undefined : createImageSrcSet(src, useProxy)}
          sizes={isSlowConnection() || useProxy ? undefined : createImageSizes()}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
          // Добавляем декодирование для лучшей производительности
          decoding="async"
        />
      )}
    </div>
  )
}
