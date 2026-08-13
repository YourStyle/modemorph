"use client"

import { WifiOff, RefreshCw } from "lucide-react"

interface NetworkErrorProps {
  message?: string
  onRetry?: () => void
  showRetry?: boolean
}

export function NetworkError({
  message = "Проблема с подключением",
  onRetry,
  showRetry = true
}: NetworkErrorProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-canvas z-50">
      <div className="text-center space-y-4 p-6 max-w-sm">
        <WifiOff className="w-16 h-16 text-ink-3 mx-auto" strokeWidth={1.75} />
        <h2 className="text-h2 text-ink">{message}</h2>
        <p className="text-body text-ink-2">
          Проверьте подключение к интернету и попробуйте снова
        </p>
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-ink text-signal-ink rounded-full hover:bg-ink/90 transition-transform duration-press active:scale-95 flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
            Попробовать снова
          </button>
        )}
      </div>
    </div>
  )
}

interface LoadingWithTimeoutProps {
  message?: string
  timeout?: number  // В миллисекундах
  onTimeout?: () => void
}

export function LoadingWithTimeout({
  message = "Загрузка...",
  timeout = 15000,
  onTimeout
}: LoadingWithTimeoutProps) {
  const [showTimeout, setShowTimeout] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowTimeout(true)
      onTimeout?.()
    }, timeout)

    return () => clearTimeout(timer)
  }, [timeout, onTimeout])

  if (showTimeout) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-canvas">
        <div className="text-center space-y-4 p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-signal mx-auto opacity-50"></div>
          <p className="text-body text-ink-2">{message}</p>
          <p className="text-caption text-ink-3">
            Это занимает больше времени, чем обычно...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-canvas">
      <div className="text-center space-y-4 p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-signal mx-auto"></div>
        <p className="text-body text-ink-2">{message}</p>
      </div>
    </div>
  )
}

// Добавим import React в начало файла
import React from "react"
