import type { SupabaseClient } from "@supabase/supabase-js"
import { uploadToYandexS3 } from "./yandex-s3"

interface MigrationStatus {
  isRunning: boolean
  progress: number
  currentFile: string
  totalFiles: number
  processedFiles: number
  successfulFiles: number
  failedFiles: string[]
  skippedFiles: number
  error: string | null
  completed: boolean
  startTime: number | null
  currentBatch: number
  totalBatches: number
  filesPerMinute: number
  smallFiles: number
  mediumFiles: number
  largeFiles: number
}

interface FileInfo {
  url: string
  table: string
  column: string
  id: string
  size: "small" | "medium" | "large"
  estimatedSize: number
}

export class YandexMigrationService {
  private readonly BATCH_SIZES = {
    small: 10, // увеличил для маленьких файлов
    medium: 5, // увеличил для средних файлов
    large: 2, // увеличил для больших файлов
  }

  private readonly TIMEOUTS = {
    small: 20000, // уменьшил таймауты
    medium: 40000,
    large: 80000,
  }

  private readonly PAUSES = {
    small: 500, // уменьшил паузы
    medium: 1000,
    large: 2000,
  }

  async migrateAllImages(
    supabase: SupabaseClient,
    retryFiles?: string[],
    onProgress?: (status: Partial<MigrationStatus>) => void,
  ) {
    console.log("🚀 Starting Yandex S3 migration...")

    try {
      // Получаем все файлы для миграции
      const files = retryFiles ? await this.getRetryFiles(supabase, retryFiles) : await this.getAllBlobFiles(supabase)

      if (files.length === 0) {
        onProgress?.({
          currentFile: "Нет файлов для миграции",
          totalFiles: 0,
          progress: 100,
        })
        return
      }

      // Категоризируем файлы по размеру
      const categorizedFiles = this.categorizeFiles(files)

      onProgress?.({
        totalFiles: files.length,
        smallFiles: categorizedFiles.small.length,
        mediumFiles: categorizedFiles.medium.length,
        largeFiles: categorizedFiles.large.length,
        currentFile: `Найдено ${files.length} файлов для миграции`,
      })

      // Обрабатываем файлы по категориям
      let processedFiles = 0
      let successfulFiles = 0
      const failedFiles: string[] = []
      const skippedFiles = 0
      const startTime = Date.now()

      // Обрабатываем все файлы вместе, но с разными настройками
      const allFiles = [...categorizedFiles.small, ...categorizedFiles.medium, ...categorizedFiles.large]

      for (let i = 0; i < allFiles.length; i += 5) {
        // обрабатываем по 5 файлов параллельно
        const batch = allFiles.slice(i, i + 5)

        onProgress?.({
          currentBatch: Math.floor(i / 5) + 1,
          totalBatches: Math.ceil(allFiles.length / 5),
          currentFile: `Обработка файлов ${i + 1}-${Math.min(i + 5, allFiles.length)} из ${allFiles.length}`,
        })

        const batchPromises = batch.map(async (file) => {
          try {
            const result = await this.migrateFile(file, supabase)
            successfulFiles++
            return { success: true, file, result }
          } catch (error) {
            console.error(`❌ Failed to migrate ${file.url}:`, error)
            failedFiles.push(file.url)
            return { success: false, file, error }
          } finally {
            processedFiles++
            onProgress?.({
              processedFiles,
              successfulFiles,
              failedFiles,
              progress: Math.round((processedFiles / files.length) * 100),
              filesPerMinute: this.calculateFilesPerMinute(processedFiles, startTime),
            })
          }
        })

        await Promise.allSettled(batchPromises)

        // Короткая пауза между батчами
        if (i + 5 < allFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 800))
        }
      }

      // Финальный статус
      onProgress?.({
        processedFiles,
        successfulFiles,
        failedFiles,
        skippedFiles,
        progress: 100,
        currentFile: `Миграция завершена! Успешно: ${successfulFiles}, Ошибки: ${failedFiles.length}`,
        filesPerMinute: this.calculateFilesPerMinute(processedFiles, startTime),
      })

      console.log(`✅ Migration completed: ${successfulFiles}/${files.length} files migrated`)
    } catch (error) {
      console.error("❌ Migration failed:", error)
      onProgress?.({
        error: error instanceof Error ? error.message : "Unknown error",
        currentFile: "Ошибка миграции",
      })
      throw error
    }
  }

  private async getAllBlobFiles(supabase: SupabaseClient): Promise<FileInfo[]> {
    const files: FileInfo[] = []

    // Только существующие таблицы
    const imageTables = [
      { table: "wardrobe_items", column: "image_url" },
      { table: "wardrobe_user_items", column: "image_url" },
      { table: "basic_wardrobe_items", column: "image_url" },
      { table: "outfits", column: "image_url" },
      { table: "user_looks", column: "image_url" },
    ]

    for (const { table, column } of imageTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select(`id, ${column}`)
          .not(column, "is", null)
          .like(column, "%blob.vercel-storage.com%")

        if (error) {
          console.error(`Error fetching from ${table}:`, error)
          continue
        }

        if (data) {
          for (const row of data) {
            const url = row[column]
            if (url && typeof url === "string" && url.includes("blob.vercel-storage.com")) {
              files.push({
                url,
                table,
                column,
                id: row.id,
                size: this.estimateFileSize(url),
                estimatedSize: this.getEstimatedBytes(url),
              })
            }
          }
        }
      } catch (error) {
        console.error(`Error processing table ${table}:`, error)
      }
    }

    console.log(`📊 Found ${files.length} blob files to migrate`)
    return files
  }

  private async getRetryFiles(supabase: SupabaseClient, retryUrls: string[]): Promise<FileInfo[]> {
    const files: FileInfo[] = []

    const imageTables = [
      { table: "wardrobe_items", column: "image_url" },
      { table: "wardrobe_user_items", column: "image_url" },
      { table: "basic_wardrobe_items", column: "image_url" },
      { table: "outfits", column: "image_url" },
      { table: "user_looks", column: "image_url" },
    ]

    for (const { table, column } of imageTables) {
      try {
        const { data, error } = await supabase.from(table).select(`id, ${column}`).in(column, retryUrls)

        if (error) {
          console.error(`Error fetching retry files from ${table}:`, error)
          continue
        }

        if (data) {
          for (const row of data) {
            const url = row[column]
            if (url && retryUrls.includes(url)) {
              files.push({
                url,
                table,
                column,
                id: row.id,
                size: this.estimateFileSize(url),
                estimatedSize: this.getEstimatedBytes(url),
              })
            }
          }
        }
      } catch (error) {
        console.error(`Error processing retry files from table ${table}:`, error)
      }
    }

    return files
  }

  private categorizeFiles(files: FileInfo[]) {
    return {
      small: files.filter((f) => f.size === "small"),
      medium: files.filter((f) => f.size === "medium"),
      large: files.filter((f) => f.size === "large"),
    }
  }

  private estimateFileSize(url: string): "small" | "medium" | "large" {
    // Простая эвристика на основе URL
    if (url.includes("thumb") || url.includes("small") || url.includes("150x")) {
      return "small"
    }
    if (url.includes("medium") || url.includes("500x") || url.includes("300x")) {
      return "medium"
    }
    return "large" // По умолчанию считаем большим
  }

  private getEstimatedBytes(url: string): number {
    const size = this.estimateFileSize(url)
    switch (size) {
      case "small":
        return 250000 // 250KB
      case "medium":
        return 1000000 // 1MB
      case "large":
        return 3000000 // 3MB
    }
  }

  private async migrateFile(file: FileInfo, supabase: SupabaseClient): Promise<string> {
    const timeout = this.TIMEOUTS[file.size]
    const maxRetries = 2 // уменьшил количество попыток
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Migrating ${file.url} (attempt ${attempt}/${maxRetries})`)

        // Скачиваем файл с таймаутом
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(file.url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; YandexMigration/1.0)",
          },
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const buffer = await response.arrayBuffer()
        const contentType = response.headers.get("content-type") || "image/jpeg"

        // Сохраняем оригинальное имя файла и структуру папок
        const fileName = this.preserveOriginalPath(file.url)

        // Загружаем в Yandex S3
        const result = await uploadToYandexS3(buffer, fileName, contentType)

        if (!result.success) {
          throw new Error(result.error || "Upload failed")
        }

        // Обновляем URL в базе данных
        const { error: updateError } = await supabase
          .from(file.table)
          .update({ [file.column]: result.url })
          .eq("id", file.id)

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`)
        }

        console.log(`✅ Successfully migrated: ${file.url} -> ${result.url}`)
        return result.url
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error")
        console.error(`❌ Attempt ${attempt} failed for ${file.url}:`, lastError.message)

        if (attempt < maxRetries) {
          // Короткая задержка перед повтором
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    throw lastError || new Error("Migration failed after all retries")
  }

  private preserveOriginalPath(originalUrl: string): string {
    try {
      // Извлекаем путь из URL blob storage
      const url = new URL(originalUrl)
      const pathParts = url.pathname.split("/")

      // Берем последнюю часть пути (имя файла)
      const fileName = pathParts[pathParts.length - 1]

      // Если есть папки в пути, сохраняем их
      if (pathParts.length > 2) {
        const folders = pathParts.slice(1, -1).join("/")
        return `${folders}/${fileName}`
      }

      return fileName
    } catch (error) {
      // Если не можем распарсить URL, генерируем новое имя
      const timestamp = Date.now()
      const random = Math.random().toString(36).substring(2, 8)
      return `images/${timestamp}-${random}.jpg`
    }
  }

  private calculateFilesPerMinute(processedFiles: number, startTime: number): number {
    const elapsedMinutes = (Date.now() - startTime) / (1000 * 60)
    return elapsedMinutes > 0 ? Math.round(processedFiles / elapsedMinutes) : 0
  }
}
