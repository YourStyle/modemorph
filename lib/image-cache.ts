// Кэш для изображений
class ImageCache {
  private cache = new Map<string, string | null>()
  private loadingPromises = new Map<string, Promise<string | null>>()

  // Получить изображение из кэша или загрузить
  async getImage(itemName: string): Promise<string | null> {
    // Проверяем кэш
    if (this.cache.has(itemName)) {
      return this.cache.get(itemName) || null
    }

    // Проверяем, не загружается ли уже
    if (this.loadingPromises.has(itemName)) {
      return this.loadingPromises.get(itemName) || null
    }

    // Загружаем изображение
    const loadPromise = this.loadImage(itemName)
    this.loadingPromises.set(itemName, loadPromise)

    try {
      const imageUrl = await loadPromise
      this.cache.set(itemName, imageUrl)
      this.loadingPromises.delete(itemName)
      return imageUrl
    } catch (error) {
      this.loadingPromises.delete(itemName)
      this.cache.set(itemName, null)
      return null
    }
  }

  private async loadImage(itemName: string): Promise<string | null> {
    try {
      const response = await fetch("/api/images/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemName }),
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      return data.imageUrl || null
    } catch (error) {
      console.error("Error loading image:", error)
      return null
    }
  }

  // Предзагрузка изображений для списка элементов
  async preloadImages(itemNames: string[]): Promise<void> {
    const promises = itemNames.map((name) => this.getImage(name))
    await Promise.allSettled(promises)
  }

  // Очистить кэш
  clearCache(): void {
    this.cache.clear()
    this.loadingPromises.clear()
  }

  // Получить размер кэша
  getCacheSize(): number {
    return this.cache.size
  }

  // Получить все закэшированные изображения
  getCachedImages(): Map<string, string | null> {
    return new Map(this.cache)
  }
}

// Экспортируем синглтон
export const imageCache = new ImageCache()
