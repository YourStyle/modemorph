import { listYandexS3Files, uploadToYandexS3 } from "./yandex-s3"
import { list } from "@vercel/blob"

interface CorruptedFile {
  key: string
  size: number
  yandexUrl: string
  blobUrl?: string
}

interface FixResult {
  total: number
  corrupted: number
  fixed: number
  failed: number
  errors: string[]
}

export class CorruptedFilesFixer {
  private static instance: CorruptedFilesFixer
  private isRunning = false
  private progress = {
    total: 0,
    processed: 0,
    corrupted: 0,
    fixed: 0,
    failed: 0,
    errors: [] as string[],
  }

  static getInstance(): CorruptedFilesFixer {
    if (!CorruptedFilesFixer.instance) {
      CorruptedFilesFixer.instance = new CorruptedFilesFixer()
    }
    return CorruptedFilesFixer.instance
  }

  getProgress() {
    return { ...this.progress, isRunning: this.isRunning }
  }

  async findCorruptedFiles(): Promise<CorruptedFile[]> {
    try {
      console.log("🔍 Поиск поврежденных файлов в Yandex S3...")

      const result = await listYandexS3Files()
      if (!result.success || !result.files) {
        throw new Error("Не удалось получить список файлов из Yandex S3")
      }

      // Фильтруем файлы размером 75 байт (поврежденные)
      const corruptedFiles = result.files
        .filter((file) => file.size === 75)
        .map((file) => ({
          key: file.key,
          size: file.size,
          yandexUrl: `https://storage.yandexcloud.net/modemorphs3/${file.key}`,
        }))

      console.log(`📊 Найдено ${corruptedFiles.length} поврежденных файлов из ${result.files.length} общих`)

      return corruptedFiles
    } catch (error) {
      console.error("❌ Ошибка при поиске поврежденных файлов:", error)
      throw error
    }
  }

  async getBlobFiles(): Promise<Array<{ pathname: string; url: string }>> {
    try {
      console.log("🔍 Получение списка файлов из Vercel Blob...")

      const { blobs } = await list({
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })

      // Фильтруем только изображения
      const imageBlobs = blobs.filter((blob) => blob.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i))

      console.log(`📊 Найдено ${imageBlobs.length} изображений в Vercel Blob`)

      return imageBlobs.map((blob) => ({
        pathname: blob.pathname,
        url: blob.url,
      }))
    } catch (error) {
      console.error("❌ Ошибка при получении файлов из Blob:", error)
      throw error
    }
  }

  private findMatchingBlobFile(
    corruptedKey: string,
    blobFiles: Array<{ pathname: string; url: string }>,
  ): string | null {
    // Извлекаем имя файла из ключа
    const fileName = corruptedKey.split("/").pop()?.toLowerCase()
    if (!fileName) return null

    // Ищем точное совпадение по имени файла
    const exactMatch = blobFiles.find((blob) => {
      const blobFileName = blob.pathname.split("/").pop()?.toLowerCase()
      return blobFileName === fileName
    })

    if (exactMatch) {
      return exactMatch.url
    }

    // Ищем частичное совпадение (без расширения)
    const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "")
    const partialMatch = blobFiles.find((blob) => {
      const blobFileName = blob.pathname.split("/").pop()?.toLowerCase()
      const blobFileNameWithoutExt = blobFileName?.replace(/\.[^/.]+$/, "")
      return blobFileNameWithoutExt === fileNameWithoutExt
    })

    return partialMatch?.url || null
  }

  async fixCorruptedFiles(): Promise<FixResult> {
    if (this.isRunning) {
      throw new Error("Процесс исправления уже запущен")
    }

    this.isRunning = true
    this.progress = {
      total: 0,
      processed: 0,
      corrupted: 0,
      fixed: 0,
      failed: 0,
      errors: [],
    }

    try {
      console.log("🚀 Начинаем исправление поврежденных файлов...")

      // Получаем списки файлов
      const [corruptedFiles, blobFiles] = await Promise.all([this.findCorruptedFiles(), this.getBlobFiles()])

      this.progress.total = corruptedFiles.length
      this.progress.corrupted = corruptedFiles.length

      console.log(`📋 Найдено ${corruptedFiles.length} поврежденных файлов для исправления`)

      // Обрабатываем файлы батчами по 3
      const batchSize = 3
      for (let i = 0; i < corruptedFiles.length; i += batchSize) {
        const batch = corruptedFiles.slice(i, i + batchSize)

        await Promise.all(
          batch.map(async (corruptedFile) => {
            try {
              // Ищем соответствующий файл в blob
              const blobUrl = this.findMatchingBlobFile(corruptedFile.key, blobFiles)

              if (!blobUrl) {
                this.progress.failed++
                this.progress.errors.push(`Не найден оригинальный файл для ${corruptedFile.key}`)
                console.log(`⚠️ Не найден оригинал для: ${corruptedFile.key}`)
                return
              }

              console.log(`🔄 Исправляем файл: ${corruptedFile.key}`)
              console.log(`📥 Скачиваем из: ${blobUrl}`)

              // Скачиваем оригинальный файл из blob
              const response = await fetch(blobUrl)
              if (!response.ok) {
                throw new Error(`Не удалось скачать файл: ${response.status}`)
              }

              const fileBuffer = Buffer.from(await response.arrayBuffer())
              console.log(`📊 Размер скачанного файла: ${fileBuffer.length} байт`)

              // Определяем content-type
              const contentType = response.headers.get("content-type") || "image/jpeg"

              // Загружаем исправленный файл в Yandex S3
              const uploadResult = await uploadToYandexS3(fileBuffer, corruptedFile.key, contentType)

              if (uploadResult.success) {
                this.progress.fixed++
                console.log(`✅ Файл исправлен: ${corruptedFile.key}`)
              } else {
                this.progress.failed++
                this.progress.errors.push(`Ошибка загрузки ${corruptedFile.key}: ${uploadResult.error}`)
                console.log(`❌ Ошибка загрузки: ${corruptedFile.key} - ${uploadResult.error}`)
              }
            } catch (error) {
              this.progress.failed++
              const errorMsg = `Ошибка обработки ${corruptedFile.key}: ${error instanceof Error ? error.message : "Unknown error"}`
              this.progress.errors.push(errorMsg)
              console.error(`❌ ${errorMsg}`)
            } finally {
              this.progress.processed++
            }
          }),
        )

        // Пауза между батчами
        if (i + batchSize < corruptedFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      const result: FixResult = {
        total: this.progress.total,
        corrupted: this.progress.corrupted,
        fixed: this.progress.fixed,
        failed: this.progress.failed,
        errors: this.progress.errors,
      }

      console.log("🎉 Исправление завершено!")
      console.log(`📊 Статистика: ${result.fixed} исправлено, ${result.failed} ошибок`)

      return result
    } catch (error) {
      console.error("❌ Критическая ошибка при исправлении файлов:", error)
      throw error
    } finally {
      this.isRunning = false
    }
  }

  async getCorruptedFilesPreview(): Promise<{
    corruptedCount: number
    totalFiles: number
    examples: Array<{ key: string; size: number }>
  }> {
    try {
      const result = await listYandexS3Files()
      if (!result.success || !result.files) {
        throw new Error("Не удалось получить спис��к файлов")
      }

      const corruptedFiles = result.files.filter((file) => file.size === 75)

      return {
        corruptedCount: corruptedFiles.length,
        totalFiles: result.files.length,
        examples: corruptedFiles.slice(0, 5).map((file) => ({
          key: file.key,
          size: file.size,
        })),
      }
    } catch (error) {
      console.error("❌ Ошибка при получении превью:", error)
      throw error
    }
  }
}
