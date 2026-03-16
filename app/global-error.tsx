"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ru">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Что-то пошло не так</h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Произошла непредвиденная ошибка. Наша команда уже уведомлена.</p>
            <button
              onClick={reset}
              style={{ background: '#111827', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer' }}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
