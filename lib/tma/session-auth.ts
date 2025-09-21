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

  static getInstance(): TMASessionAuth {
    if (!TMASessionAuth.instance) {
      TMASessionAuth.instance = new TMASessionAuth()
    }
    return TMASessionAuth.instance
  }

  // Сохранить сессию в sessionStorage
  saveSession(session: TMASession): void {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth] Window undefined, cannot save session')
      return
    }

    try {
      console.log('[SessionAuth] Saving session:', {
        user_id: session.user_id,
        expires_at: new Date(session.expires_at).toISOString(),
        has_access_token: !!session.access_token,
        has_refresh_token: !!session.refresh_token
      })
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      console.log('[SessionAuth] Session saved successfully')
    } catch (error) {
      console.error('[SessionAuth] Failed to save session:', error)
    }
  }

  // Получить сессию из sessionStorage
  getSession(): TMASession | null {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth] Window undefined, cannot get session')
      return null
    }

    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      console.log('[SessionAuth] Reading from sessionStorage:', !!stored)

      if (!stored) {
        console.log('[SessionAuth] No session found in storage')
        return null
      }

      const session: TMASession = JSON.parse(stored)
      console.log('[SessionAuth] Parsed session:', {
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

      console.log('[SessionAuth] Valid session found')
      return session
    } catch (error) {
      console.error('[SessionAuth] Failed to get session:', error)
      this.clearSession()
      return null
    }
  }

  // Очистить сессию
  clearSession(): void {
    if (typeof window === 'undefined') {
      console.log('[SessionAuth] Window undefined, cannot clear session')
      return
    }

    try {
      console.log('[SessionAuth] Clearing session from storage')
      sessionStorage.removeItem(SESSION_KEY)
      console.log('[SessionAuth] Session cleared successfully')
    } catch (error) {
      console.error('[SessionAuth] Failed to clear session:', error)
    }
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