"use client"

import { useState, useEffect } from "react"

export interface ConnectionInfo {
  effectiveType: "4g" | "3g" | "2g" | "slow-2g" | "unknown"
  downlink: number
  rtt: number
  saveData: boolean
  isSlowConnection: boolean
  isVerySlowConnection: boolean
}

export function useConnectionSpeed(): ConnectionInfo {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    effectiveType: "unknown",
    downlink: 0,
    rtt: 0,
    saveData: false,
    isSlowConnection: false,
    isVerySlowConnection: false,
  })

  useEffect(() => {
    const updateConnectionInfo = () => {
      if ("connection" in navigator) {
        const connection =
          (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

        if (connection) {
          const effectiveType = connection.effectiveType || "unknown"
          const downlink = connection.downlink || 0
          const rtt = connection.rtt || 0
          const saveData = connection.saveData || false

          const isVerySlowConnection = effectiveType === "slow-2g" || saveData
          const isSlowConnection =
            isVerySlowConnection || effectiveType === "2g" || effectiveType === "3g" || downlink < 1.5

          const info: ConnectionInfo = {
            effectiveType,
            downlink,
            rtt,
            saveData,
            isSlowConnection,
            isVerySlowConnection,
          }

          setConnectionInfo(info)
        }
      } else {
        // Fallback для браузеров без Network Information API
        // Определяем по User Agent (особенно важно для iOS)
        const userAgent = navigator.userAgent.toLowerCase()
        const isMobile = /iphone|ipad|android|mobile/.test(userAgent)

        setConnectionInfo({
          effectiveType: "unknown",
          downlink: 0,
          rtt: 0,
          saveData: false,
          isSlowConnection: isMobile, // Предполагаем медленное соединение для мобильных
          isVerySlowConnection: false,
        })
      }
    }

    // Обновляем информацию при загрузке
    updateConnectionInfo()

    // Слушаем изменения соединения
    if ("connection" in navigator) {
      const connection =
        (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

      if (connection) {
        connection.addEventListener("change", updateConnectionInfo)

        return () => {
          connection.removeEventListener("change", updateConnectionInfo)
        }
      }
    }
  }, [])

  return connectionInfo
}
