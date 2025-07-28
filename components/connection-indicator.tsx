"use client"

import { useConnectionSpeed } from "@/hooks/use-connection-speed"
import { cn } from "@/lib/utils"
import { useState } from "react"

export function ConnectionIndicator() {
  const connection = useConnectionSpeed()
  const [isExpanded, setIsExpanded] = useState(false)

  const getConnectionColor = () => {
    if (connection.saveData) return "bg-orange-500"

    switch (connection.effectiveType) {
      case "4g":
        return "bg-green-500"
      case "3g":
        return "bg-yellow-500"
      case "2g":
      case "slow-2g":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getConnectionText = () => {
    if (connection.saveData) return "Экономия трафика"

    switch (connection.effectiveType) {
      case "4g":
        return "4G"
      case "3g":
        return "3G"
      case "2g":
        return "2G"
      case "slow-2g":
        return "Медленный 2G"
      default:
        return "Неизвестно"
    }
  }

  const getConnectionDescription = () => {
    if (connection.saveData) return "Режим экономии трафика включен"

    switch (connection.effectiveType) {
      case "4g":
        return "Быстрое соединение"
      case "3g":
        return "Среднее соединение"
      case "2g":
      case "slow-2g":
        return "Медленное соединение"
      default:
        return "Тип соединения неизвестен"
    }
  }

  // Показываем индикатор только в development режиме или для медленных соединений
  if (process.env.NODE_ENV !== "development" && !connection.isSlowConnection) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className="bg-white shadow-lg rounded-lg overflow-hidden cursor-pointer transition-all duration-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Компактный вид */}
        <div className="p-2 flex items-center space-x-2">
          <div className={cn("w-3 h-3 rounded-full", getConnectionColor())} />
          <span className="text-sm font-medium text-gray-700">{getConnectionText()}</span>
          {connection.downlink > 0 && (
            <span className="text-xs text-gray-500">{connection.downlink.toFixed(1)} Mbps</span>
          )}
        </div>

        {/* Расширенный вид */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-3 bg-gray-50">
            <div className="text-xs text-gray-600 space-y-1">
              <div>{getConnectionDescription()}</div>
              {connection.downlink > 0 && <div>Скорость: {connection.downlink.toFixed(1)} Mbps</div>}
              {connection.rtt > 0 && <div>Задержка: {connection.rtt}ms</div>}
              <div>Тип: {connection.effectiveType}</div>
              {connection.isSlowConnection && (
                <div className="text-amber-600 font-medium">⚡ Оптимизация для медленного соединения активна</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
