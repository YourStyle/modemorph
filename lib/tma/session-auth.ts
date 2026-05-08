// lib/tma/session-auth.ts
// Session-based auth for Safari/iOS compatibility (cookies blocked in TMA)

import { parseSupabaseExpiry } from "@/lib/auth-utils"

interface TMASession {
  access_token: string
  refresh_token: string
  user_id: string
  expires_at: number
}

const SESSION_KEY = 'tma_session'

export class TMASessionAuth {
  private static instance: TMASessionAuth | null = null
  private inMemorySession: TMASession | null = null
  private storageAvailable: boolean | null = null

  static getInstance(): TMASessionAuth {
    if (!TMASessionAuth.instance) {
      TMASessionAuth.instance = new TMASessionAuth()
    }
    return TMASessionAuth.instance
  }

  private isStorageAvailable(): boolean {
    if (this.storageAvailable !== null) return this.storageAvailable
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
    } catch {
      console.warn('[SessionAuth] sessionStorage not available, using in-memory fallback')
      this.storageAvailable = false
      return false
    }
  }

  saveSession(session: TMASession): void {
    if (typeof window === 'undefined') return

    if (this.isStorageAvailable()) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
        return
      } catch (error) {
        console.error('[SessionAuth] Failed to save to sessionStorage:', error)
      }
    }

    this.inMemorySession = session
  }

  getSession(): TMASession | null {
    if (typeof window === 'undefined') return null

    if (this.isStorageAvailable()) {
      try {
        const stored = sessionStorage.getItem(SESSION_KEY)
        if (stored) {
          const session: TMASession = JSON.parse(stored)
          if (Date.now() >= session.expires_at) {
            this.clearSession()
            return null
          }
          return session
        }
      } catch (error) {
        console.error('[SessionAuth] Failed to read session:', error)
      }
    }

    if (this.inMemorySession) {
      if (Date.now() >= this.inMemorySession.expires_at) {
        this.inMemorySession = null
        return null
      }
      return this.inMemorySession
    }

    return null
  }

  clearSession(): void {
    if (typeof window === 'undefined') return

    if (this.isStorageAvailable()) {
      try {
        sessionStorage.removeItem(SESSION_KEY)
      } catch (error) {
        console.error('[SessionAuth] Failed to clear session:', error)
      }
    }

    this.inMemorySession = null
  }

  hasValidSession(): boolean {
    return this.getSession() !== null
  }

  getAccessToken(): string | null {
    return this.getSession()?.access_token || null
  }

  getUserId(): string | null {
    return this.getSession()?.user_id || null
  }

  getRefreshToken(): string | null {
    return this.getSession()?.refresh_token || null
  }

  async refreshAccessToken(): Promise<void> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`)
      }

      const data = await response.json()

      if (!data?.session?.access_token || !data?.session?.refresh_token) {
        throw new Error('Refresh response missing session tokens')
      }

      this.saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user_id ?? data.user?.id,
        expires_at: parseSupabaseExpiry(data.session.expires_at),
      })
    } catch (error) {
      console.error('[SessionAuth] Failed to refresh token:', error)
      this.clearSession()
      throw error
    }
  }

  debug(): void {
    if (typeof window === 'undefined') return
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (!stored) {
        console.log('[SessionAuth Debug] No session in storage')
        return
      }
      const session: TMASession = JSON.parse(stored)
      console.log('[SessionAuth Debug]', {
        user_id: session.user_id,
        expires_at: new Date(session.expires_at).toISOString(),
        is_expired: Date.now() >= session.expires_at,
        access_token_length: session.access_token?.length,
        refresh_token_length: session.refresh_token?.length,
      })
    } catch (error) {
      console.error('[SessionAuth Debug] Error:', error)
    }
  }
}

export const sessionAuth = TMASessionAuth.getInstance()

if (typeof window !== 'undefined') {
  (window as any).debugTMASession = () => sessionAuth.debug()
}