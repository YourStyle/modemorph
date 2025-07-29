"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useConnectionSpeed } from "@/hooks/use-connection-speed"
import { cn } from "@/lib/utils"

interface ConnectionIndicatorProps {
  className?: string
  showDetails?: boolean
}

export function ConnectionIndicator({ className, showDetails = false }: ConnectionIndicatorProps) {
  const connection = useConnectionSpeed()

  const getConnectionColor = (type: string) => {
    switch (type) {
      case "wifi":
        return "bg-green-500"
      case "4g":
        return "bg-blue-500"
      case "3g":
        return "bg-yellow-500"
      case "2g":
        return "bg-orange-500"
      case "slow":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getConnectionText = (type: string) => {
    switch (type) {
      case "wifi":
        return "WiFi"
      case "4g":
        return "4G"
      case "3g":
        return "3G"
      case "2g":
        return "2G"
      case "slow":
        return "Медленно"
      default:
        return "Неизвестно"
    }
  }

  if (!showDetails) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn("w-2 h-2 rounded-full", getConnectionColor(connection.type))} />
        <span className="text-sm text-gray-600">{getConnectionText(connection.type)}</span>
        {connection.isRussian && (
          <Badge variant="outline" className="text-xs">
            RU
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className={cn("p-3", className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full", getConnectionColor(connection.type))} />
            <span className="font-medium">{getConnectionText(connection.type)}</span>
          </div>
          <div className="flex gap-1">
            {connection.isRussian && (
              <Badge variant="outline" className="text-xs">
                RU
              </Badge>
            )}
            {connection.isSlowConnection && (
              <Badge variant="destructive" className="text-xs">
                Медленно
              </Badge>
            )}
            {connection.saveData && (
              <Badge variant="secondary" className="text-xs">
                Экономия
              </Badge>
            )}
          </div>
        </div>

        {connection.downlink && (
          <div className="text-sm text-gray-600">Скорость: {connection.downlink.toFixed(1)} Мбит/с</div>
        )}

        {connection.rtt && <div className="text-sm text-gray-600">Задержка: {connection.rtt}мс</div>}

        {connection.effectiveType && <div className="text-xs text-gray-500">Тип: {connection.effectiveType}</div>}
      </div>
    </Card>
  )
}
