"use client"

import { useState, useEffect, useMemo } from "react"
import { OptimizedImage } from "./optimized-image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getConnectionType, isSlowConnection, isRussianUser } from "@/lib/image-optimization"

interface WardrobeItem {
  id: string
  item_name: string
  image_url: string
  clothing_type?: string
  color?: string
  material?: string
  brand?: string
}

interface MobileOptimizedWardrobeGridProps {
  items: WardrobeItem[]
  onItemClick?: (item: WardrobeItem) => void
  onItemSelect?: (item: WardrobeItem) => void
  selectedItems?: string[]
  className?: string
  showConnectionInfo?: boolean
}

export function MobileOptimizedWardrobeGrid({
  items,
  onItemClick,
  onItemSelect,
  selectedItems = [],
  className,
  showConnectionInfo = false,
}: MobileOptimizedWardrobeGridProps) {
  const [displayedItems, setDisplayedItems] = useState<WardrobeItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [connectionType, setConnectionType] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)

  // Определяем размер страницы в зависимости от соединения
  const pageSize = useMemo(() => {
    const connType = getConnectionType()
    const isRussian = isRussianUser()

    // Для российских пользователей используем более консервативные размеры
    if (isRussian) {
      if (connType === "slow") return 3
      if (connType === "2g") return 4
      if (connType === "3g") return 6
      return 8
    }

    // Для других пользователей
    if (connType === "slow") return 3
    if (connType === "2g") return 6
    if (connType === "3g") return 9
    return 12
  }, [])

  // Определяем количество колонок в зависимости от размера экр��на и соединения
  const gridCols = useMemo(() => {
    if (typeof window === "undefined") return "grid-cols-2"

    const width = window.innerWidth
    const connType = getConnectionType()

    if (connType === "slow" || connType === "2g") {
      return width <= 375 ? "grid-cols-2" : "grid-cols-3"
    }

    if (width <= 375) return "grid-cols-2"
    if (width <= 768) return "grid-cols-3"
    return "grid-cols-4"
  }, [])

  useEffect(() => {
    setConnectionType(getConnectionType())
    // Загружаем первую страницу
    setDisplayedItems(items.slice(0, pageSize))
  }, [items, pageSize])

  const loadMore = async () => {
    if (isLoading) return

    setIsLoading(true)

    // Имитируем небольшую задержку для плавности
    await new Promise((resolve) => setTimeout(resolve, 300))

    const nextPage = currentPage + 1
    const startIndex = currentPage * pageSize
    const endIndex = startIndex + pageSize
    const newItems = items.slice(startIndex, endIndex)

    setDisplayedItems((prev) => [...prev, ...newItems])
    setCurrentPage(nextPage)
    setIsLoading(false)
  }

  const hasMore = displayedItems.length < items.length

  return (
    <div className={cn("space-y-4", className)}>
      {/* Индикатор соединения */}
      {showConnectionInfo && (
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                connectionType === "wifi"
                  ? "bg-green-500"
                  : connectionType === "4g"
                    ? "bg-blue-500"
                    : connectionType === "3g"
                      ? "bg-yellow-500"
                      : "bg-red-500",
              )}
            />
            <span>Соединение: {connectionType}</span>
            {isRussianUser() && (
              <Badge variant="outline" className="text-xs">
                RU
              </Badge>
            )}
          </div>
          <div className="text-gray-600">
            Показано: {displayedItems.length} из {items.length}
          </div>
        </div>
      )}

      {/* Сетка элементов */}
      <div className={cn("grid gap-3", gridCols)}>
        {displayedItems.map((item, index) => (
          <Card
            key={item.id}
            className={cn(
              "relative overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md",
              selectedItems.includes(item.id) && "ring-2 ring-blue-500",
            )}
            onClick={() => onItemClick?.(item)}
          >
            {/* Изображение */}
            <div className="aspect-square relative">
              <OptimizedImage
                src={item.image_url}
                alt={item.item_name}
                width={200}
                height={200}
                className="w-full h-full"
                showConnectionInfo={showConnectionInfo}
                priority={index < 6} // Приоритет для первых 6 элементов
              />

              {/* Кнопка выбора */}
              {onItemSelect && (
                <button
                  className={cn(
                    "absolute top-2 right-2 w-6 h-6 rounded-full border-2 bg-white transition-all",
                    selectedItems.includes(item.id)
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300 hover:border-blue-400",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onItemSelect(item)
                  }}
                >
                  {selectedItems.includes(item.id) && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              )}
            </div>

            {/* Информация об элементе */}
            <div className="p-3 space-y-1">
              <h3 className="font-medium text-sm line-clamp-2">{item.item_name}</h3>

              <div className="flex flex-wrap gap-1">
                {item.clothing_type && (
                  <Badge variant="secondary" className="text-xs">
                    {item.clothing_type}
                  </Badge>
                )}
                {item.color && (
                  <Badge variant="outline" className="text-xs">
                    {item.color}
                  </Badge>
                )}
              </div>

              {item.brand && <p className="text-xs text-gray-500 truncate">{item.brand}</p>}
            </div>
          </Card>
        ))}
      </div>

      {/* Кнопка "Загрузить еще" */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button onClick={loadMore} disabled={isLoading} variant="outline" className="min-w-[200px] bg-transparent">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Загрузка...
              </div>
            ) : (
              `Загрузить еще (${Math.min(pageSize, items.length - displayedItems.length)})`
            )}
          </Button>
        </div>
      )}

      {/* Индикатор медленного соединения */}
      {isSlowConnection() && (
        <div className="text-center p-4 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-700">
            🐌 Обнаружено медленное соединение. Изображения загружаются в уменьшенном размере для экономии трафика.
          </p>
        </div>
      )}
    </div>
  )
}
