"use client"

import { useState, useEffect, useMemo } from "react"
import { OptimizedImage } from "./optimized-image"
import { isSlowConnection } from "@/lib/image-optimization"
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
  const [isSlowConn, setIsSlowConn] = useState(false)

  // Определяем размер начальной загрузки в зависимости от скорости соединения
  const initialLoadCount = useMemo(() => {
    if (typeof window === "undefined") return 12

    const isSlow = isSlowConnection()
    setIsSlowConn(isSlow)

    // Для медленного соединения загружаем меньше элементов
    return isSlow ? 6 : 12
  }, [])

  const loadMoreCount = isSlowConn ? 6 : 12

  useEffect(() => {
    // Загружаем первую порцию элементов
    setVisibleItems(items.slice(0, initialLoadCount))
    setLoadedCount(initialLoadCount)
  }, [items, initialLoadCount])

  const loadMore = () => {
    const nextCount = loadedCount + loadMoreCount
    setVisibleItems(items.slice(0, nextCount))
    setLoadedCount(nextCount)
  }

  const hasMore = loadedCount < items.length

  // Определяем количество колонок в зависимости от размера экрана и скорости соединения
  const getGridCols = () => {
    if (typeof window === "undefined") return "grid-cols-2"

    const width = window.innerWidth

    if (isSlowConn) {
      // Для медленного соединения меньше колонок
      return width <= 480 ? "grid-cols-2" : "grid-cols-3"
    }

    // Для быстрого соединения
    if (width <= 480) return "grid-cols-2"
    if (width <= 768) return "grid-cols-3"
    return "grid-cols-4"
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Индикатор медленного соединения */}
      {isSlowConn && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            📱 Обнаружено медленное соединение. Изображения оптимизированы для экономии трафика.
          </p>
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
                width={200}
                height={200}
                className="w-full h-full"
                // Приоритет для первых изображений
                priority={index < 4}
                onError={() => console.warn(`Failed to load image for ${item.item_name}`)}
              />
            </div>

            <div className="p-3">
              <h3 className="font-medium text-sm text-gray-900 truncate">{item.item_name}</h3>
              {item.clothing_type && <p className="text-xs text-gray-500 mt-1">{item.clothing_type}</p>}
              {item.color && (
                <div className="flex items-center mt-2">
                  <div
                    className="w-3 h-3 rounded-full border border-gray-300 mr-2"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-gray-500">{item.color}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Кнопка "Загрузить еще" */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={false}
          >
            Загрузить еще ({items.length - loadedCount} осталось)
          </button>
        </div>
      )}

      {/* Информация о загруженных элементах */}
      <div className="mt-4 text-center text-sm text-gray-500">
        Показано {visibleItems.length} из {items.length} элементов
      </div>
    </div>
  )
}
