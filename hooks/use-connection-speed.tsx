"use client"

import { useState, useEffect } from "react"

export interface ConnectionInfo {
  effectiveType: "4g" | "3g" | "2g" | "slow-2g" | "unknown"
  downlink: number
  rtt: number
  saveData: boolean
  isSlowConnection: boolean
}

export function useConnectionSpeed(): ConnectionInfo {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    effectiveType: "unknown",
    downlink: 0,
    rtt: 0,
    saveData: false,
    isSlowConnection: false,
  })

  useEffect(() => {
    const updateConnectionInfo = () => {
      if ("connection" in navigator) {
        const connection = (navigator as any).connection

        const info: ConnectionInfo = {
          effectiveType: connection.effectiveType || "unknown",
          downlink: connection.downlink || 0,
          rtt: connection.rtt || 0,
          saveData: connection.saveData || false,
          isSlowConnection:
            connection.effectiveType === "slow-2g" ||
            connection.effectiveType === "2g" ||
            connection.effectiveType === "3g" ||
            connection.downlink < 1.5 ||
            connection.saveData,
        }

        setConnectionInfo(info)
      }
    }

    // Обновляем информацию при загрузке
    updateConnectionInfo()

    // Слушаем изменения соединения
    if ("connection" in navigator) {
      const connection = (navigator as any).connection
      connection.addEventListener("change", updateConnectionInfo)

      return () => {
        connection.removeEventListener("change", updateConnectionInfo)
      }
    }
  }, [])

  return connectionInfo
}
