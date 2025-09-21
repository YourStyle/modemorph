// hooks/use-session-auth.ts
// Универсальный хук для session-based авторизации

import { useState, useEffect } from 'react'
import { sessionAuth } from '@/lib/tma/session-auth'

export interface AuthUser {
  id: string
  telegram_id?: string
  full_name?: string
  avatar_url?: string
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
}

export function useSessionAuth(): AuthState & {
  login: (sessionData: any) => void
  logout: () => void
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false
  })

  // Проверка существующей сессии при инициализации
  useEffect(() => {
    const checkSession = () => {
      try {
        if (sessionAuth.hasValidSession()) {
          const userId = sessionAuth.getUserId()
          if (userId) {
            setState({
              user: { id: userId },
              isLoading: false,
              isAuthenticated: true
            })
            return
          }
        }

        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false
        })
      } catch (error) {
        console.error('[useSessionAuth] Error checking session:', error)
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false
        })
      }
    }

    checkSession()
  }, [])

  const login = (sessionData: { session: any, user: any }) => {
    try {
      // Правильно парсим дату истечения
      let expiresAt: number
      if (typeof sessionData.session.expires_at === 'number') {
        const timestamp = sessionData.session.expires_at
        expiresAt = timestamp < 2000000000 ? timestamp * 1000 : timestamp
      } else if (typeof sessionData.session.expires_at === 'string') {
        expiresAt = new Date(sessionData.session.expires_at).getTime()
      } else {
        expiresAt = Date.now() + (60 * 60 * 1000) // 1 час
      }

      sessionAuth.saveSession({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user_id: sessionData.user.id,
        expires_at: expiresAt
      })

      setState({
        user: {
          id: sessionData.user.id,
          telegram_id: sessionData.user.user_metadata?.telegram_id,
          full_name: sessionData.user.user_metadata?.full_name,
          avatar_url: sessionData.user.user_metadata?.telegram_photo_url
        },
        isLoading: false,
        isAuthenticated: true
      })
    } catch (error) {
      console.error('[useSessionAuth] Login error:', error)
    }
  }

  const logout = () => {
    sessionAuth.clearSession()
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false
    })
  }

  return {
    ...state,
    login,
    logout
  }
}