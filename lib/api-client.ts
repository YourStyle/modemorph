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

  private getHeaders(customHeaders: Record<string, string> = {}, body?: any): Record<string, string> {
    const headers: Record<string, string> = {
      ...customHeaders
    }

    // Для FormData не устанавливаем Content-Type - браузер сам установит с boundary
    if (!(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    // Добавляем токен авторизации если есть
    const accessToken = sessionAuth.getAccessToken()
    console.log('[API Client] getHeaders - accessToken:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null')
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
      console.log('[API Client] Authorization header added')
    } else {
      console.warn('[API Client] No access token available - request will be unauthorized')
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
      headers: this.getHeaders(customHeaders, body),
      cache,
      credentials: 'include' // Fallback для cookie-based endpoints
    }

    if (body && method !== 'GET') {
      // Для FormData не применяем JSON.stringify
      if (body instanceof FormData) {
        config.body = body
      } else {
        config.body = typeof body === 'string' ? body : JSON.stringify(body)
      }
    }

    console.log(`[API Client] ${method} ${url} (attempt ${attempt + 1})`, { hasToken: !!sessionAuth.getAccessToken() })

    const response = await fetch(url, config)

    if (!response.ok) {
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