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

  // Telegram: sessionStorage — initData re-creates the session on every open,
  // and a stale one must not outlive a Telegram account switch.
  // Web / installed PWA: localStorage — iOS drops sessionStorage whenever the
  // home-screen app is unloaded, which meant logging in on every launch.
  private store(): Storage {
    return (window as any).Telegram?.WebApp?.initData ? sessionStorage : localStorage
  }

  private isStorageAvailable(): boolean {
    if (this.storageAvailable !== null) return this.storageAvailable
    if (typeof window === 'undefined') {
      this.storageAvailable = false
      return false
    }
    try {
      const test = '__storage_test__'
      this.store().setItem(test, test)
      this.store().removeItem(test)
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
        this.store().setItem(SESSION_KEY, JSON.stringify(session))
        return
      } catch (error) {
        console.error('[SessionAuth] Failed to save to sessionStorage:', error)
      }
    }

    this.inMemorySession = session
  }

  // No client-side expiry check on purpose. An expired access token used to wipe
  // the whole session — refresh token included — so after 60 min idle the next
  // request went out with no header at all ("401 Missing token" on onboarding
  // submit) and the 401 → refresh path had nothing to refresh with. The server
  // is the only judge of expiry: it answers 401, api-client refreshes and retries.
  // This also survives a phone clock that runs ahead of the server's.
  getSession(): TMASession | null {
    if (typeof window === 'undefined') return null

    if (this.isStorageAvailable()) {
      try {
        const stored = this.store().getItem(SESSION_KEY)
        if (stored) return JSON.parse(stored)
      } catch (error) {
        console.error('[SessionAuth] Failed to read session:', error)
      }
    }

    return this.inMemorySession
  }

  clearSession(): void {
    if (typeof window === 'undefined') return

    if (this.isStorageAvailable()) {
      try {
        this.store().removeItem(SESSION_KEY)
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
      const stored = this.store().getItem(SESSION_KEY)
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