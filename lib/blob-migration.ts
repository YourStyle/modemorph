import { list, put, type ListBlobResult } from "@vercel/blob"

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

export class BlobMigrationService {
  private static instance: BlobMigrationService
  private status: MigrationStatus = {
    isRunning: false,
    progress: 0,
    currentFile: "",
    totalFiles: 0,
    processedFiles: 0,
    successfulFiles: 0,
    failedFiles: [],
    skippedFiles: 0,
    error: null,
    completed: false,
    startTime: null,
    currentBatch: 0,
    totalBatches: 0,
    filesPerMinute: 0,
    smallFiles: 0,
    mediumFiles: 0,
    largeFiles: 0,
  }

  private constructor() {}

  static getInstance(): BlobMigrationService {
    if (!BlobMigrationService.instance) {
      BlobMigrationService.instance = new BlobMigrationService()
    }
    return BlobMigrationService.instance
  }

  getStatus(): MigrationStatus {
    return { ...this.status }
  }

  private updateStatus(updates: Partial<MigrationStatus>) {
    this.status = { ...this.status, ...updates }

    // Обновляем скорость
    if (this.status.startTime && this.status.processedFiles > 0) {
      const elapsedMinutes = (Date.now() - this.status.startTime) / (1000 * 60)
      this.status.filesPerMinute = Math.round(this.status.processedFiles / elapsedMinutes)
    }
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": "ModeMorph-Migration/1.0",
          Connection: "keep-alive",
          ...options.headers,
        },
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    baseDelay: number,
    context: string,
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        console.warn(`${context} - Attempt ${attempt}/${maxRetries} failed:`, error)

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1)
          console.log(`${context} - Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError!
  }

  private getFileCategory(size: number): {
    category: "small" | "medium" | "large"
    timeout: number
    batchSize: number
    delay: number
  } {
    if (size < 500 * 1024) {
      // < 500KB
      return { category: "small", timeout: 30000, batchSize: 6, delay: 1000 }
    } else if (size < 2 * 1024 * 1024) {
      // 500KB - 2MB
      return { category: "medium", timeout: 90000, batchSize: 2, delay: 3000 }
    } else {
      // > 2MB
      return { category: "large", timeout: 180000, batchSize: 1, delay: 5000 }
    }
  }

  private async migrateFile(blob: ListBlobResult["blobs"][0], existingFiles: Set<string>): Promise<boolean> {
    const fileName = blob.pathname

    // Проверяем, существует ли файл уже в новом хранилище
    if (existingFiles.has(fileName)) {
      console.log(`File ${fileName} already exists, skipping`)
      this.updateStatus({
        skippedFiles: this.status.skippedFiles + 1,
        processedFiles: this.status.processedFiles + 1,
      })
      return true
    }

    const fileCategory = this.getFileCategory(blob.size)
    const baseDelay = fileCategory.category === "small" ? 2000 : fileCategory.category === "medium" ? 3000 : 5000

    try {
      await this.retryWithBackoff(
        async () => {
          // Скачиваем файл из старого хранилища
          const response = await this.fetchWithTimeout(blob.url, {}, fileCategory.timeout)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const fileBuffer = await response.arrayBuffer()
          const file = new File([fileBuffer], fileName, {
            type: blob.contentType || "application/octet-stream",
          })

          // Загружаем в новое хранилище
          await put(fileName, file, {
            access: "public",
            token: process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN,
          })

          console.log(`Successfully migrated: ${fileName} (${(blob.size / 1024).toFixed(1)}KB)`)
        },
        4,
        baseDelay,
        `Migrating ${fileName}`,
      )

      this.updateStatus({
        successfulFiles: this.status.successfulFiles + 1,
        processedFiles: this.status.processedFiles + 1,
      })
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`Failed to migrate ${fileName}:`, errorMessage)

      this.updateStatus({
        failedFiles: [...this.status.failedFiles, `${fileName} - ${errorMessage}`],
        processedFiles: this.status.processedFiles + 1,
      })
      return false
    }
  }

  async startMigration(retryOnly = false): Promise<void> {
    if (this.status.isRunning) {
      throw new Error("Migration is already running")
    }

    try {
      this.updateStatus({
        isRunning: true,
        progress: 0,
        currentFile: "Initializing...",
        totalFiles: 0,
        processedFiles: 0,
        successfulFiles: 0,
        failedFiles: [],
        skippedFiles: 0,
        error: null,
        completed: false,
        startTime: Date.now(),
        currentBatch: 0,
        totalBatches: 0,
        filesPerMinute: 0,
        smallFiles: 0,
        mediumFiles: 0,
        largeFiles: 0,
      })

      // Получаем список файлов из старого хранилища
      this.updateStatus({ currentFile: "Fetching file list from source..." })
      const { blobs: sourceBlobs } = await list({
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })

      // Фильтруем только медиа файлы
      const mediaExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".mov", ".avi", ".mkv"]
      let filesToMigrate = sourceBlobs.filter((blob) =>
        mediaExtensions.some((ext) => blob.pathname.toLowerCase().endsWith(ext)),
      )

      // Если это повторная попытка, берем только неудачные файлы
      if (retryOnly && this.status.failedFiles.length > 0) {
        const failedFileNames = this.status.failedFiles.map((f) => f.split(" - ")[0])
        filesToMigrate = filesToMigrate.filter((blob) => failedFileNames.includes(blob.pathname))
        // Сбрасываем список неудачных файлов
        this.updateStatus({ failedFiles: [] })
      }

      if (filesToMigrate.length === 0) {
        this.updateStatus({
          isRunning: false,
          completed: true,
          currentFile: retryOnly ? "No failed files to retry" : "No media files found to migrate",
        })
        return
      }

      // Получаем список существующих файлов в новом хранилище
      this.updateStatus({ currentFile: "Checking existing files in destination..." })
      const { blobs: existingBlobs } = await list({
        token: process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN,
      })
      const existingFiles = new Set(existingBlobs.map((blob) => blob.pathname))

      // Категоризируем файлы по размеру
      const smallFiles = filesToMigrate.filter((blob) => blob.size < 500 * 1024)
      const mediumFiles = filesToMigrate.filter((blob) => blob.size >= 500 * 1024 && blob.size < 2 * 1024 * 1024)
      const largeFiles = filesToMigrate.filter((blob) => blob.size >= 2 * 1024 * 1024)

      this.updateStatus({
        totalFiles: filesToMigrate.length,
        smallFiles: smallFiles.length,
        mediumFiles: mediumFiles.length,
        largeFiles: largeFiles.length,
      })

      // Сортируем файлы: сначала маленькие, потом средние, потом большие
      const sortedFiles = [...smallFiles, ...mediumFiles, ...largeFiles]

      // Группируем файлы по категориям для батчевой обработки
      const fileGroups = [
        { files: smallFiles, config: this.getFileCategory(100 * 1024) },
        { files: mediumFiles, config: this.getFileCategory(1024 * 1024) },
        { files: largeFiles, config: this.getFileCategory(5 * 1024 * 1024) },
      ]

      let totalBatches = 0
      for (const group of fileGroups) {
        totalBatches += Math.ceil(group.files.length / group.config.batchSize)
      }

      this.updateStatus({ totalBatches })

      // Обрабатываем каждую группу файлов
      for (const group of fileGroups) {
        if (group.files.length === 0) continue

        const { files, config } = group
        console.log(`Processing ${files.length} ${config.category} files with batch size ${config.batchSize}`)

        // Обрабатываем файлы батчами
        for (let i = 0; i < files.length; i += config.batchSize) {
          const batch = files.slice(i, i + config.batchSize)
          const batchNumber = Math.floor(i / config.batchSize) + 1
          const totalBatchesInGroup = Math.ceil(files.length / config.batchSize)

          this.updateStatus({
            currentBatch: this.status.currentBatch + 1,
            currentFile: `Processing ${config.category} files batch ${batchNumber}/${totalBatchesInGroup} (${batch.length} files)`,
          })

          // Обрабатываем файлы в батче параллельно
          const batchPromises = batch.map(async (blob) => {
            this.updateStatus({ currentFile: `Migrating: ${blob.pathname}` })
            return this.migrateFile(blob, existingFiles)
          })

          await Promise.allSettled(batchPromises)

          // Обновляем прогресс
          const progress = Math.round((this.status.processedFiles / this.status.totalFiles) * 100)
          this.updateStatus({ progress })

          // Пауза между батчами
          if (i + config.batchSize < files.length) {
            await new Promise((resolve) => setTimeout(resolve, config.delay))
          }
        }
      }

      // Завершение миграции
      this.updateStatus({
        isRunning: false,
        completed: true,
        progress: 100,
        currentFile: `Migration completed! ${this.status.successfulFiles} successful, ${this.status.failedFiles.length} failed, ${this.status.skippedFiles} skipped`,
      })

      console.log("Migration completed successfully!")
      console.log(`Total files: ${this.status.totalFiles}`)
      console.log(`Successful: ${this.status.successfulFiles}`)
      console.log(`Failed: ${this.status.failedFiles.length}`)
      console.log(`Skipped: ${this.status.skippedFiles}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Migration failed:", errorMessage)

      this.updateStatus({
        isRunning: false,
        error: errorMessage,
        currentFile: `Migration failed: ${errorMessage}`,
      })

      throw error
    }
  }

  async retryFailedFiles(): Promise<void> {
    if (this.status.failedFiles.length === 0) {
      throw new Error("No failed files to retry")
    }

    await this.startMigration(true)
  }
}
