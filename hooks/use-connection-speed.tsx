"use client"

import { useState, useEffect } from "react"
import { getConnectionType, getConnectionInfo, isRussianUser } from "@/lib/image-optimization"

interface ConnectionSpeed {
  type: "wifi" | "4g" | "3g" | "2g" | "slow"
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
  isRussian: boolean
  isSlowConnection: boolean
}

export function useConnectionSpeed() {
  const [connectionSpeed, setConnectionSpeed] = useState<ConnectionSpeed>({
    type: "3g",
    isRussian: false,
    isSlowConnection: false,
  })

  useEffect(() => {
    const updateConnectionInfo = () => {
      const type = getConnectionType()
      const info = getConnectionInfo()
      const isRussian = isRussianUser()

      setConnectionSpeed({
        type,
        effectiveType: info?.effectiveType,
        downlink: info?.downlink,
        rtt: info?.rtt,
        saveData: info?.saveData,
        isRussian,
        isSlowConnection: type === "slow" || type === "2g",
      })
    }

    // Обновляем информацию при загрузке
    updateConnectionInfo()

    // Слушаем изменения соединения
    if (typeof navigator !== "undefined" && "connection" in navigator) {
      const connection = (navigator as any).connection
      if (connection) {
        connection.addEventListener("change", updateConnectionInfo)
        return () => {
          connection.removeEventListener("change", updateConnectionInfo)
        }
      }
    }

    // Периодически обновляем информацию
    const interval = setInterval(updateConnectionInfo, 30000) // каждые 30 секунд

    return () => {
      clearInterval(interval)
    }
  }, [])

  return connectionSpeed
}
