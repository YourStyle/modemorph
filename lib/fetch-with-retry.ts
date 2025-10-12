// lib/fetch-with-retry.ts
// Обёртка для fetch с таймаутами, retry и offline detection

export interface FetchWithRetryOptions {
  timeout?: number       // Таймаут в миллисекундах (default: 10000ms = 10s)
  retries?: number       // Количество попыток (default: 2)
  retryDelay?: number    // Задержка между попытками (default: 1000ms)
  backoff?: boolean      // Экспоненциальная задержка (default: true)
  checkOnline?: boolean  // Проверять navigator.onLine (default: true)
}

export class NetworkError extends Error {
  constructor(message: string, public readonly isOffline: boolean = false) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message)
    this.name = 'TimeoutError'
  }
}

/**
 * Fetch с автоматическими повторами и таймаутом
 *
 * @example
 * const response = await fetchWithRetry('/api/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ foo: 'bar' })
 * }, {
 *   timeout: 5000,
 *   retries: 3
 * })
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    timeout = 10000,
    retries = 2,
    retryDelay = 1000,
    backoff = true,
    checkOnline = true
  } = retryOptions

  // Проверяем подключение к интернету
  if (checkOnline && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new NetworkError('No internet connection', true)
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Создаем AbortController для таймаута
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Возвращаем ответ, даже если статус не OK
        // Это позволяет вызывающему коду обрабатывать разные статусы
        return response

      } catch (error) {
        clearTimeout(timeoutId)

        // Если это AbortError, то это таймаут
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TimeoutError(`Request timeout after ${timeout}ms`)
        }

        throw error
      }

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Если это последняя попытка, выбрасываем ошибку
      if (attempt === retries) {
        break
      }

      // Для offline ошибок не делаем retry
      if (lastError instanceof NetworkError && lastError.isOffline) {
        break
      }

      // Вычисляем задержку перед следующей попыткой
      const delay = backoff ? retryDelay * Math.pow(2, attempt) : retryDelay

      console.log(`[FetchWithRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, {
        url,
        error: lastError.message
      })

      await new Promise(resolve => setTimeout(resolve, delay))

      // Проверяем подключение перед повтором
      if (checkOnline && typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new NetworkError('No internet connection', true)
      }
    }
  }

  // Если дошли сюда, значит все попытки исчерпаны
  throw lastError || new Error('Max retries reached')
}

/**
 * Обёртка для fetch с автоматическим парсингом JSON
 *
 * @example
 * const data = await fetchJSON<{ user: User }>('/api/user', {
 *   method: 'POST',
 *   body: JSON.stringify({ id: 123 })
 * })
 */
export async function fetchJSON<T = any>(
  url: string,
  options: RequestInit = {},
  retryOptions: FetchWithRetryOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, options, retryOptions)

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${response.status}: ${error}`)
  }

  return response.json()
}

/**
 * Хук для проверки онлайн статуса
 * Использовать в компонентах React
 */
export function useOnlineStatus() {
  if (typeof window === 'undefined') {
    return true
  }

  return navigator.onLine
}
