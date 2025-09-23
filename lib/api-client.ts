// lib/api-client.ts
// Универсальный API клиент с session-based авторизацией

import { sessionAuth } from "./tma/session-auth"

interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: any
  headers?: Record<string, string>
  cache?: RequestCache
}

class ApiClient {
  private static instance: ApiClient | null = null

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient()
    }
    return ApiClient.instance
  }

  private getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders
    }

    // Добавляем токен авторизации если есть
    const accessToken = sessionAuth.getAccessToken()
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    return headers
  }

  async request<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
    return this.requestWithRetry(url, options, 0)
  }

  private async requestWithRetry<T = any>(url: string, options: ApiClientOptions = {}, attempt: number = 0): Promise<T> {
    const {
      method = 'GET',
      body,
      headers: customHeaders = {},
      cache = 'no-store'
    } = options

    const config: RequestInit = {
      method,
      headers: this.getHeaders(customHeaders),
      cache,
      credentials: 'include' // Fallback для cookie-based endpoints
    }

    if (body && method !== 'GET') {
      config.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    console.log(`[API Client] ${method} ${url} (attempt ${attempt + 1})`, { hasToken: !!sessionAuth.getAccessToken() })

    const response = await fetch(url, config)

    if (!response.ok) {
      // Логика повторных попыток для 401 ошибок
      if (response.status === 401 && attempt < 3) {
        console.log(`[API Client] 401 error on attempt ${attempt + 1}, retrying...`)

        // Пытаемся обновить токен через refreshToken если он есть
        try {
          const refreshToken = sessionAuth.getRefreshToken()
          if (refreshToken && sessionAuth.refreshAccessToken) {
            await sessionAuth.refreshAccessToken()
            // Повторяем запрос с новым токеном
            return this.requestWithRetry(url, options, attempt + 1)
          }
        } catch (refreshError) {
          console.log('[API Client] Failed to refresh token:', refreshError)
        }

        // Если это 3-я попытка или refresh не сработал, делаем еще одну попытку
        if (attempt < 2) {
          return this.requestWithRetry(url, options, attempt + 1)
        }
      }

      // Если все попытки исчерпаны и это 401, очищаем сессию и редиректим
      if (response.status === 401 && attempt >= 2) {
        console.log('[API Client] All retry attempts failed, clearing session and redirecting')
        sessionAuth.clearSession()

        // Редиректим на главную страницу
        if (typeof window !== 'undefined') {
          window.location.href = '/'
        }
      }

      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(`API Error ${response.status}: ${errorText}`)
    }

    // Проверяем, есть ли контент для парсинга
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return await response.json()
    }

    return response.text() as any
  }

  // Удобные методы для разных HTTP методов
  async get<T = any>(url: string, options: Omit<ApiClientOptions, 'method'> = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' })
  }

  async post<T = any>(url: string, body?: any, options: Omit<ApiClientOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'POST', body })
  }

  async put<T = any>(url: string, body?: any, options: Omit<ApiClientOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PUT', body })
  }

  async delete<T = any>(url: string, options: Omit<ApiClientOptions, 'method'> = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' })
  }

  async patch<T = any>(url: string, body?: any, options: Omit<ApiClientOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PATCH', body })
  }
}

export const apiClient = ApiClient.getInstance()

// Удобные функции для использования
export const api = {
  get: <T = any>(url: string, options?: Omit<ApiClientOptions, 'method'>) => apiClient.get<T>(url, options),
  post: <T = any>(url: string, body?: any, options?: Omit<ApiClientOptions, 'method' | 'body'>) => apiClient.post<T>(url, body, options),
  put: <T = any>(url: string, body?: any, options?: Omit<ApiClientOptions, 'method' | 'body'>) => apiClient.put<T>(url, body, options),
  delete: <T = any>(url: string, options?: Omit<ApiClientOptions, 'method'>) => apiClient.delete<T>(url, options),
  patch: <T = any>(url: string, body?: any, options?: Omit<ApiClientOptions, 'method' | 'body'>) => apiClient.patch<T>(url, body, options),
}