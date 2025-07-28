/**
 * Утилиты для оптимизации изображений на мобильных устройствах
 * Специально оптимизировано для iPhone с медленным интернетом
 */

// Определяем размеры изображений для разных устройств и скоростей соединения
export const IMAGE_SIZES = {
  // Очень маленькие изображения для 2G
  micro: { width: 80, height: 80, quality: 40 },
  // Маленькие изображения для медленного 3G
  thumbnail: { width: 150, height: 150, quality: 50 },
  // Средние изображения для быстрого 3G
  small: { width: 300, height: 300, quality: 65 },
  // Большие изображения для 4G
  medium: { width: 600, height: 600, quality: 75 },
  // Полноразмерные изображения для WiFi
  large: { width: 1200, height: 1200, quality: 85 },
} as const

export type ImageSize = keyof typeof IMAGE_SIZES

/**
 * Определяет тип соединения пользователя
 */
export function getConnectionType(): "wifi" | "4g" | "3g" | "2g" | "slow" {
  if (typeof navigator === "undefined") return "3g"

  // Проверяем Network Information API
  const connection =
    (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

  if (connection) {
    const effectiveType = connection.effectiveType
    const downlink = connection.downlink || 0
    const saveData = connection.saveData

    // Если включен режим экономии трафика
    if (saveData) return "slow"

    // Определяем по effectiveType
    if (effectiveType === "slow-2g") return "slow"
    if (effectiveType === "2g") return "2g"
    if (effectiveType === "3g") return downlink > 1.5 ? "3g" : "2g"
    if (effectiveType === "4g") return downlink > 10 ? "wifi" : "4g"
  }

  // Fallback: определяем по User Agent (для iPhone)
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes("iphone") || userAgent.includes("ipad")) {
    // Для iOS устройств по умолчанию считаем соединение средним
    return "3g"
  }

  return "3g"
}

/**
 * Определяет оптимальный размер изображения
 */
export function getOptimalImageSize(): ImageSize {
  if (typeof window === "undefined") return "small"

  const connectionType = getConnectionType()
  const screenWidth = window.innerWidth
  const isRetina = window.devicePixelRatio > 1

  // Для очень медленного соединения
  if (connectionType === "slow") {
    return screenWidth <= 375 ? "micro" : "thumbnail"
  }

  // Для 2G соединения
  if (connectionType === "2g") {
    return screenWidth <= 375 ? "thumbnail" : "small"
  }

  // Для 3G соединения
  if (connectionType === "3g") {
    if (screenWidth <= 375) return "thumbnail"
    if (screenWidth <= 768) return "small"
    return "medium"
  }

  // Для 4G соединения
  if (connectionType === "4g") {
    if (screenWidth <= 375) return "small"
    if (screenWidth <= 768) return "medium"
    return "large"
  }

  // Для WiFi
  if (screenWidth <= 375) return isRetina ? "medium" : "small"
  if (screenWidth <= 768) return isRetina ? "large" : "medium"
  return "large"
}

/**
 * Создает оптимизированный URL для Vercel Blob Storage
 */
export function createOptimizedImageUrl(originalUrl: string, size?: ImageSize): string {
  if (!originalUrl || originalUrl === "") {
    return "/placeholder.svg?height=150&width=150&text=No+Image"
  }

  const targetSize = size || getOptimalImageSize()
  const { width, height, quality } = IMAGE_SIZES[targetSize]

  // Проверяем, что это Vercel Blob URL
  if (originalUrl.includes("blob.vercel-storage.com")) {
    try {
      const url = new URL(originalUrl)

      // Добавляем параметры оптимизации
      url.searchParams.set("w", width.toString())
      url.searchParams.set("h", height.toString())
      url.searchParams.set("q", quality.toString())
      url.searchParams.set("fit", "cover")
      url.searchParams.set("auto", "format")

      return url.toString()
    } catch (error) {
      console.warn("Invalid URL:", originalUrl)
      return "/placeholder.svg?height=150&width=150&text=Invalid+URL"
    }
  }

  // Для других URL возвращаем как есть
  return originalUrl
}

/**
 * Создает набор URL для разных размеров (srcSet)
 */
export function createImageSrcSet(originalUrl: string): string {
  if (!originalUrl) return ""

  const connectionType = getConnectionType()

  // Для медленного соединения не используем srcSet
  if (connectionType === "slow" || connectionType === "2g") {
    return ""
  }

  const sizes: ImageSize[] = ["thumbnail", "small", "medium", "large"]

  return sizes
    .map((size) => {
      const optimizedUrl = createOptimizedImageUrl(originalUrl, size)
      const { width } = IMAGE_SIZES[size]
      return `${optimizedUrl} ${width}w`
    })
    .join(", ")
}

/**
 * Создает sizes атрибут для адаптивных изображений
 */
export function createImageSizes(): string {
  const connectionType = getConnectionType()

  // Для медленного соединения используем фиксированные размеры
  if (connectionType === "slow" || connectionType === "2g") {
    return "150px"
  }

  return ["(max-width: 375px) 150px", "(max-width: 768px) 300px", "(max-width: 1200px) 600px", "1200px"].join(", ")
}

/**
 * Проверяет, медленное ли соединение
 */
export function isSlowConnection(): boolean {
  const connectionType = getConnectionType()
  return connectionType === "slow" || connectionType === "2g"
}

/**
 * Проверяет, очень ли медленное соединение
 */
export function isVerySlowConnection(): boolean {
  const connectionType = getConnectionType()
  return connectionType === "slow"
}

/**
 * Сжимает изображение перед загрузкой
 */
export function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      // Определяем максимальный размер в зависимости от соединения
      const connectionType = getConnectionType()
      let targetWidth = maxWidth
      let targetQuality = quality

      if (connectionType === "slow") {
        targetWidth = Math.min(maxWidth, 400)
        targetQuality = 0.5
      } else if (connectionType === "2g") {
        targetWidth = Math.min(maxWidth, 600)
        targetQuality = 0.6
      }

      // Вычисляем новые размеры с сохранением пропорций
      let { width, height } = img

      if (width > targetWidth) {
        height = (height * targetWidth) / width
        width = targetWidth
      }

      canvas.width = width
      canvas.height = height

      // Рисуем сжатое изображение
      ctx?.drawImage(img, 0, 0, width, height)

      // Конвертируем в blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          } else {
            resolve(file)
          }
        },
        file.type,
        targetQuality,
      )
    }

    img.onerror = () => {
      // В случае ошибки возвращаем оригинальный файл
      resolve(file)
    }

    img.src = URL.createObjectURL(file)
  })
}

/**
 * Предзагружает изображение с таймаутом
 */
export function preloadImage(src: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => {
      reject(new Error("Image load timeout"))
    }, timeout)

    img.onload = () => {
      clearTimeout(timer)
      resolve()
    }

    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error("Image load failed"))
    }

    img.src = src
  })
}

/**
 * Создает placeholder изображение
 */
export function createPlaceholderUrl(width = 150, height = 150, text = ""): string {
  const encodedText = encodeURIComponent(text || "Loading...")
  return `/placeholder.svg?height=${height}&width=${width}&text=${encodedText}`
}

/**
 * Получает информацию о соединении для отладки
 */
export function getConnectionInfo() {
  if (typeof navigator === "undefined") return null

  const connection =
    (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

  if (!connection) return null

  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData,
    type: connection.type,
  }
}
