// lib/api-transport.ts
// Универсальный транспортный слой для всех API запросов с session-based авторизацией

import { sessionAuth } from "./tma/session-auth"

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: any
  skipAuth?: boolean // Для публичных эндпоинтов
}

interface ApiResponse<T = any> {
  data?: T
  error?: string
  status: number
  ok: boolean
}

class ApiTransport {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  /**
   * Получает заголовки с автоматической авторизацией
   */
  private getHeaders(options?: ApiRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {})
    }

    // Добавляем авторизацию если не отключена
    if (!options?.skipAuth) {
      const accessToken = sessionAuth.getAccessToken()
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
      }
    }

    return headers
  }

  /**
   * Обрабатывает тело запроса
   */
  private processBody(body: any): string | undefined {
    if (!body) return undefined

    if (typeof body === 'string') return body

    return JSON.stringify(body)
  }

  /**
   * Обрабатывает ответ от API
   */
  private async processResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const status = response.status
    const ok = response.ok

    try {
      // Пытаемся получить JSON
      const data = await response.json()

      if (!ok) {
        // Если статус не OK, но есть JSON с ошибкой
        return {
          error: data.error || data.message || `HTTP ${status}`,
          status,
          ok: false
        }
      }

      return {
        data,
        status,
        ok: true
      }
    } catch (error) {
      // Если не удалось получить JSON
      const text = await response.text().catch(() => '')

      return {
        error: text || `HTTP ${status}`,
        status,
        ok: false
      }
    }
  }

  /**
   * Выполняет HTTP запрос
   */
  private async request<T = any>(
    method: string,
    endpoint: string,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`

    const requestOptions: RequestInit = {
      method,
      headers: this.getHeaders(options),
      cache: options?.cache || 'no-store',
      ...options
    }

    // Обрабатываем тело запроса
    if (options?.body) {
      requestOptions.body = this.processBody(options.body)
    }

    try {
      console.log(`[ApiTransport] ${method} ${url}`, {
        hasAuth: !options?.skipAuth && !!sessionAuth.getAccessToken(),
        body: options?.body ? 'present' : 'none'
      })

      const response = await fetch(url, requestOptions)
      const result = await this.processResponse<T>(response)

      // Логируем результат
      if (!result.ok) {
        console.error(`[ApiTransport] ${method} ${url} failed:`, result.error)
      }

      // Обрабатываем 401 ошибки - возможно токен истек
      if (result.status === 401 && !options?.skipAuth) {
        console.warn('[ApiTransport] 401 Unauthorized - clearing session')
        sessionAuth.clearSession()

        // Можно добавить редирект на страницу логина или показать уведомление
        if (typeof window !== 'undefined') {
          // Перезагружаем страницу, чтобы пользователя перекинуло на авторизацию
          window.location.reload()
        }
      }

      return result
    } catch (error) {
      console.error(`[ApiTransport] ${method} ${url} network error:`, error)

      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
        ok: false
      }
    }
  }

  /**
   * GET запрос
   */
  async get<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint, options)
  }

  /**
   * POST запрос
   */
  async post<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, { ...options, body })
  }

  /**
   * PUT запрос
   */
  async put<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, { ...options, body })
  }

  /**
   * PATCH запрос
   */
  async patch<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', endpoint, { ...options, body })
  }

  /**
   * DELETE запрос
   */
  async delete<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint, options)
  }

  /**
   * Загрузка файла с FormData
   */
  async upload<T = any>(endpoint: string, formData: FormData, options?: Omit<ApiRequestOptions, 'body'>): Promise<ApiResponse<T>> {
    // Для загрузки файлов не устанавливаем Content-Type, браузер сам добавит boundary
    const uploadOptions = {
      ...options,
      headers: {
        ...(options?.headers || {}),
        // Удаляем Content-Type для FormData
      }
    }

    // Убираем Content-Type из заголовков для FormData
    delete (uploadOptions.headers as any)['Content-Type']

    const headers = this.getHeaders({ ...uploadOptions, skipAuth: options?.skipAuth })
    delete headers['Content-Type'] // Убираем Content-Type для FormData

    try {
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`

      console.log(`[ApiTransport] UPLOAD ${url}`, {
        hasAuth: !options?.skipAuth && !!sessionAuth.getAccessToken(),
        formData: 'present'
      })

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        cache: uploadOptions.cache || 'no-store'
      })

      return await this.processResponse<T>(response)
    } catch (error) {
      console.error(`[ApiTransport] UPLOAD ${endpoint} error:`, error)

      return {
        error: error instanceof Error ? error.message : 'Upload error',
        status: 0,
        ok: false
      }
    }
  }
}

// Создаем глобальный экземпляр
export const api = new ApiTransport()

// Экспортируем класс для создания дополнительных экземпляров при необходимости
export { ApiTransport }

// Типы для удобства
export type { ApiResponse, ApiRequestOptions }