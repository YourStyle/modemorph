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
    if (typeof window === 'undefined') return

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  // Получить сессию из sessionStorage
  getSession(): TMASession | null {
    if (typeof window === 'undefined') return null

    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (!stored) return null

      const session: TMASession = JSON.parse(stored)

      // Проверяем, не истекла ли сессия
      if (Date.now() >= session.expires_at) {
        this.clearSession()
        return null
      }

      return session
    } catch (error) {
      console.error('Failed to get session:', error)
      this.clearSession()
      return null
    }
  }

  // Очистить сессию
  clearSession(): void {
    if (typeof window === 'undefined') return

    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      console.error('Failed to clear session:', error)
    }
  }

  // Проверить, есть ли валидная сессия
  hasValidSession(): boolean {
    return this.getSession() !== null
  }

  // Получить access token для API запросов
  getAccessToken(): string | null {
    const session = this.getSession()
    return session?.access_token || null
  }

  // Получить user ID
  getUserId(): string | null {
    const session = this.getSession()
    return session?.user_id || null
  }
}

export const sessionAuth = TMASessionAuth.getInstance()