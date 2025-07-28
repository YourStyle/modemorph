"use client"

import { useConnectionSpeed } from "@/hooks/use-connection-speed"
import { cn } from "@/lib/utils"

export function ConnectionIndicator() {
  const connection = useConnectionSpeed()

  const getConnectionColor = () => {
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
        return "Быстрое соединение"
      case "3g":
        return "Среднее соединение"
      case "2g":
      case "slow-2g":
        return "Медленное соединение"
      default:
        return "Соединение"
    }
  }

  if (connection.effectiveType === "unknown") return null

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-white shadow-lg rounded-lg p-2 flex items-center space-x-2 text-xs">
        <div className={cn("w-2 h-2 rounded-full", getConnectionColor())} />
        <span className="text-gray-700">{getConnectionText()}</span>
        {connection.downlink > 0 && <span className="text-gray-500">{connection.downlink.toFixed(1)} Mbps</span>}
      </div>
    </div>
  )
}
