/**
 * Утилиты для оптимизации изображений на мобильных устройствах
 */

// Определяем размеры изображений для разных устройств
export const IMAGE_SIZES = {
  thumbnail: { width: 150, height: 150, quality: 60 },
  small: { width: 300, height: 300, quality: 70 },
  medium: { width: 600, height: 600, quality: 80 },
  large: { width: 1200, height: 1200, quality: 85 },
} as const

export type ImageSize = keyof typeof IMAGE_SIZES

/**
 * Определяет оптимальный размер изображения на основе размера экрана
 */
export function getOptimalImageSize(): ImageSize {
  if (typeof window === "undefined") return "medium"

  const width = window.innerWidth
  const isSlowConnection =
    navigator.connection &&
    (navigator.connection.effectiveType === "slow-2g" ||
      navigator.connection.effectiveType === "2g" ||
      navigator.connection.effectiveType === "3g")

  // Для медленного соединения используем меньшие размеры
  if (isSlowConnection) {
    if (width <= 480) return "thumbnail"
    if (width <= 768) return "small"
    return "medium"
  }

  // Для быстрого соединения
  if (width <= 480) return "small"
  if (width <= 768) return "medium"
  if (width <= 1200) return "large"
  return "large"
}

/**
 * Создает оптимизированный URL для изображения
 */
export function createOptimizedImageUrl(originalUrl: string, size: ImageSize = "medium"): string {
  if (!originalUrl) return ""

  const { width, height, quality } = IMAGE_SIZES[size]

  // Если это Vercel Blob URL, добавляем параметры оптимизации
  if (originalUrl.includes("blob.vercel-storage.com")) {
    const url = new URL(originalUrl)
    url.searchParams.set("w", width.toString())
    url.searchParams.set("h", height.toString())
    url.searchParams.set("q", quality.toString())
    url.searchParams.set("fit", "cover")
    return url.toString()
  }

  return originalUrl
}

/**
 * Создает srcSet для адаптивных изображений
 */
export function createImageSrcSet(originalUrl: string): string {
  if (!originalUrl) return ""

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
  return ["(max-width: 480px) 150px", "(max-width: 768px) 300px", "(max-width: 1200px) 600px", "1200px"].join(", ")
}

/**
 * Проверяет, медленное ли соединение
 */
export function isSlowConnection(): boolean {
  if (typeof navigator === "undefined" || !navigator.connection) {
    return false
  }

  const connection = navigator.connection
  return (
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g" ||
    connection.effectiveType === "3g" ||
    connection.downlink < 1.5
  )
}

/**
 * Сжимает изображение перед загрузкой
 */
export function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()

    img.onload = () => {
      // Вычисляем новые размеры с сохранением пропорций
      let { width, height } = img

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
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
        quality,
      )
    }

    img.src = URL.createObjectURL(file)
  })
}

/**
 * Предзагружает изображение
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = src
  })
}
