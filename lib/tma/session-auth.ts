// lib/tma/session-auth.ts
// Авторизация через sessionStorage для решения проблем с cookies в Safari/iOS

interface TMASession {
  access_token: string
  refresh_token: string
  user_id: string
  expires_at: number
}

const SESSION_KEY = 'tma_session'

export class TMASessionAuth {
  private static instance: TMASessionAuth | null = null
  private inMemorySession: TMASession | null = null  // Fallback для Safari private mode
  private storageAvailable: boolean | null = null    // Кэш проверки доступности

  static getInstance(): TMASessionAuth {
    if (!TMASessionAuth.instance) {
      TMASessionAuth.instance = new TMASessionAuth()
    }
    return TMASessionAuth.instance
  }

  // Проверяем доступность sessionStorage (может быть недоступен в Safari private mode)
  private isStorageAvailable(): boolean {
    // Используем кэшированное значение, если доступно
    if (this.storageAvailable !== null) {
      return this.storageAvailable
    }

    if (typeof window === 'undefined') {
      this.storageAvailable = false
      return false
    }

    try {
      const test = '__storage_test__'
      sessionStorage.setItem(test, test)
      sessionStorage.removeItem(test)
      this.storageAvailable = true
      return true
    } catch (e) {
      console.warn('[SessionAuth] sessionStorage not available, using in-memory fallback')
      this.storageAvailable = false
      return false
    }
  }

  // Сохранить сессию в sessionStorage
  saveSession(session: TMASession): void {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth] Window undefined, cannot save session')
      return
    }

    console.log('[SessionAuth] Saving session:', {
      user_id: session.user_id,
      expires_at: new Date(session.expires_at).toISOString(),
      has_access_token: !!session.access_token,
      has_refresh_token: !!session.refresh_token
    })

    // Пробуем сохранить в sessionStorage
    if (this.isStorageAvailable()) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
        console.log('[SessionAuth] Session saved to sessionStorage')
        return
      } catch (error) {
        console.error('[SessionAuth] Failed to save to sessionStorage:', error)
      }
    }

    // Fallback: сохраняем в памяти
    this.inMemorySession = session
    console.log('[SessionAuth] Session saved to memory (fallback)')
  }

  // Получить сессию из sessionStorage
  getSession(): TMASession | null {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth] Window undefined, cannot get session')
      return null
    }

    // Сначала пробуем из sessionStorage
    if (this.isStorageAvailable()) {
      try {
        const stored = sessionStorage.getItem(SESSION_KEY)
        console.log('[SessionAuth] Reading from sessionStorage:', !!stored)

        if (stored) {
          const session: TMASession = JSON.parse(stored)
          console.log('[SessionAuth] Parsed session from storage:', {
            user_id: session.user_id,
            expires_at: new Date(session.expires_at).toISOString(),
            has_access_token: !!session.access_token,
            has_refresh_token: !!session.refresh_token,
            is_expired: Date.now() >= session.expires_at
          })

          // Проверяем, не истекла ли сессия
          if (Date.now() >= session.expires_at) {
            console.log('[SessionAuth] Session expired, clearing')
            this.clearSession()
            return null
          }

          console.log('[SessionAuth] Valid session found in storage')
          return session
        }
      } catch (error) {
        console.error('[SessionAuth] Failed to get session from storage:', error)
      }
    }

    // Fallback: проверяем in-memory сессию
    if (this.inMemorySession) {
      console.log('[SessionAuth] Using in-memory session')

      // Проверяем, не истекла ли сессия
      if (Date.now() >= this.inMemorySession.expires_at) {
        console.log('[SessionAuth] In-memory session expired, clearing')
        this.inMemorySession = null
        return null
      }

      return this.inMemorySession
    }

    console.log('[SessionAuth] No session found')
    return null
  }

  // Очистить сессию
  clearSession(): void {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth] Window undefined, cannot clear session')
      return
    }

    console.log('[SessionAuth] Clearing session')

    // Очищаем sessionStorage
    if (this.isStorageAvailable()) {
      try {
        sessionStorage.removeItem(SESSION_KEY)
        console.log('[SessionAuth] Session cleared from storage')
      } catch (error) {
        console.error('[SessionAuth] Failed to clear session from storage:', error)
      }
    }

    // Очищаем in-memory сессию
    this.inMemorySession = null
    console.log('[SessionAuth] Session cleared from memory')
  }

  // Проверить, есть ли валидная сессия
  hasValidSession(): boolean {
    console.log('[SessionAuth] Checking if session is valid')
    const hasValid = this.getSession() !== null
    console.log('[SessionAuth] Has valid session:', hasValid)
    return hasValid
  }

  // Получить access token для API запросов
  getAccessToken(): string | null {
    console.log('[SessionAuth] Getting access token')
    const session = this.getSession()
    const token = session?.access_token || null
    console.log('[SessionAuth] Access token available:', !!token)
    return token
  }

  // Получить user ID
  getUserId(): string | null {
    console.log('[SessionAuth] Getting user ID')
    const session = this.getSession()
    const userId = session?.user_id || null
    console.log('[SessionAuth] User ID:', userId)
    return userId
  }

  // Получить refresh token
  getRefreshToken(): string | null {
    console.log('[SessionAuth] Getting refresh token')
    const session = this.getSession()
    const token = session?.refresh_token || null
    console.log('[SessionAuth] Refresh token available:', !!token)
    return token
  }

  // Обновить access token через refresh token
  async refreshAccessToken(): Promise<void> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    console.log('[SessionAuth] Attempting to refresh access token')

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`)
      }

      const newSession = await response.json()
      console.log('[SessionAuth] Token refreshed successfully')

      // Обновляем сессию с новыми токенами
      this.saveSession(newSession)
    } catch (error) {
      console.error('[SessionAuth] Failed to refresh token:', error)
      this.clearSession()
      throw error
    }
  }

  // Debug функция для проверки состояния сессии
  debug(): void {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth Debug] Window undefined - running on server')
      return
    }

    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (!stored) {
        console.log('[SessionAuth Debug] No session in storage')
        return
      }

      const session: TMASession = JSON.parse(stored)
      console.log('[SessionAuth Debug] Session details:', {
        user_id: session.user_id,
        expires_at: new Date(session.expires_at).toISOString(),
        is_expired: Date.now() >= session.expires_at,
        access_token_length: session.access_token?.length,
        refresh_token_length: session.refresh_token?.length,
        raw_storage: stored.slice(0, 100) + '...'
      })
    } catch (error) {
      console.error('[SessionAuth Debug] Error reading session:', error)
    }
  }
}

export const sessionAuth = TMASessionAuth.getInstance()

// Глобальная функция для отладки
if (typeof window !== 'undefined') {
  (window as any).debugTMASession = () => sessionAuth.debug()
}