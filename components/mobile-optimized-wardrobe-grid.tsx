"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { OptimizedImage } from "./optimized-image"
import { isSlowConnection, isVerySlowConnection, getConnectionType } from "@/lib/image-optimization"
import { cn } from "@/lib/utils"

interface WardrobeItem {
  id: string
  item_name: string
  image_url: string
  clothing_type?: string
  color?: string
}

interface MobileOptimizedWardrobeGridProps {
  items: WardrobeItem[]
  onItemClick?: (item: WardrobeItem) => void
  className?: string
}

export function MobileOptimizedWardrobeGrid({ items, onItemClick, className }: MobileOptimizedWardrobeGridProps) {
  const [visibleItems, setVisibleItems] = useState<WardrobeItem[]>([])
  const [loadedCount, setLoadedCount] = useState(0)
  const [connectionType, setConnectionType] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())

  // Определяем параметры загрузки в зависимости от соединения
  const loadingParams = useMemo(() => {
    const connType = getConnectionType()
    setConnectionType(connType)

    switch (connType) {
      case "slow":
        return { initial: 3, increment: 3, delay: 1000 }
      case "2g":
        return { initial: 4, increment: 4, delay: 800 }
      case "3g":
        return { initial: 6, increment: 6, delay: 500 }
      case "4g":
        return { initial: 9, increment: 9, delay: 300 }
      case "wifi":
        return { initial: 12, increment: 12, delay: 100 }
      default:
        return { initial: 6, increment: 6, delay: 500 }
    }
  }, [])

  useEffect(() => {
    // Загружаем первую порцию элементов
    setVisibleItems(items.slice(0, loadingParams.initial))
    setLoadedCount(loadingParams.initial)
  }, [items, loadingParams.initial])

  const loadMore = useCallback(async () => {
    if (isLoading) return

    setIsLoading(true)

    // Добавляем задержку для медленных соединений
    await new Promise((resolve) => setTimeout(resolve, loadingParams.delay))

    const nextCount = loadedCount + loadingParams.increment
    setVisibleItems(items.slice(0, nextCount))
    setLoadedCount(nextCount)
    setIsLoading(false)
  }, [items, loadedCount, loadingParams, isLoading])

  const handleImageLoad = useCallback((itemId: string) => {
    setLoadedImages((prev) => new Set(prev).add(itemId))
  }, [])

  const hasMore = loadedCount < items.length
  const isSlowConn = isSlowConnection()
  const isVerySlowConn = isVerySlowConnection()

  // Определяем количество колонок
  const getGridCols = () => {
    if (typeof window === "undefined") return "grid-cols-2"

    const width = window.innerWidth

    if (isVerySlowConn) {
      return "grid-cols-2" // Всегда 2 колонки для очень медленного соединения
    }

    if (isSlowConn) {
      return width <= 375 ? "grid-cols-2" : "grid-cols-3"
    }

    // Для быстрого соединения
    if (width <= 375) return "grid-cols-2"
    if (width <= 768) return "grid-cols-3"
    return "grid-cols-4"
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Индикатор соединения */}
      {(isSlowConn || isVerySlowConn) && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="text-amber-600">{isVerySlowConn ? "🐌" : "📱"}</div>
            <div className="text-sm text-amber-800">
              <div className="font-medium">
                {isVerySlowConn ? "Очень медленное соединение" : "Медленное соединение"}
              </div>
              <div className="text-xs">Изображения оптимизированы для экономии трафика ({connectionType})</div>
            </div>
          </div>
        </div>
      )}

      {/* Статистика загрузки для отладки */}
      {process.env.NODE_ENV === "development" && (
        <div className="mb-2 text-xs text-gray-500 bg-gray-100 p-2 rounded">
          Соединение: {connectionType} | Загружено изображений: {loadedImages.size}/{visibleItems.length}
        </div>
      )}

      {/* Сетка элементов */}
      <div className={cn("grid gap-3", getGridCols())}>
        {visibleItems.map((item, index) => (
          <div
            key={item.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onItemClick?.(item)}
          >
            <div className="aspect-square">
              <OptimizedImage
                src={item.image_url}
                alt={item.item_name}
                width={isVerySlowConn ? 120 : isSlowConn ? 150 : 200}
                height={isVerySlowConn ? 120 : isSlowConn ? 150 : 200}
                className="w-full h-full"
                // Приоритет только для первых 2-3 изображений
                priority={index < (isSlowConn ? 2 : 4)}
                onLoad={() => handleImageLoad(item.id)}
                onError={() => console.warn(`Failed to load image for ${item.item_name}`)}
                showConnectionInfo={process.env.NODE_ENV === "development"}
              />
            </div>

            <div className="p-3">
              <h3 className="font-medium text-sm text-gray-900 truncate leading-tight">{item.item_name}</h3>
              {item.clothing_type && <p className="text-xs text-gray-500 mt-1 truncate">{item.clothing_type}</p>}
              {item.color && (
                <div className="flex items-center mt-2">
                  <div
                    className="w-3 h-3 rounded-full border border-gray-300 mr-2 flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-gray-500 truncate">{item.color}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Сообщение если нет элементов */}
      {visibleItems.length === 0 && !isLoading && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">👗</div>
          <p className="text-gray-500">Элементы гардероба не найдены</p>
        </div>
      )}

      {/* Кнопка "Загрузить еще" */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className={cn(
              "px-6 py-3 rounded-lg transition-colors font-medium",
              isLoading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Загрузка...</span>
              </div>
            ) : (
              `Загрузить еще (${items.length - loadedCount} осталось)`
            )}
          </button>
        </div>
      )}

      {/* Информация о загруженных элементах */}
      <div className="mt-4 text-center text-sm text-gray-500">
        Показано {visibleItems.length} из {items.length} элементов
        {loadedImages.size > 0 && <span className="ml-2">• Изображений загружено: {loadedImages.size}</span>}
      </div>
    </div>
  )
}
