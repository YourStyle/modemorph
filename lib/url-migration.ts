import type { SupabaseClient } from "@supabase/supabase-js"

interface UrlMigrationStatus {
  isRunning: boolean
  progress: number
  currentTable: string
  totalTables: number
  processedTables: number
  totalUpdates: number
  successfulUpdates: number
  failedUpdates: number
  error: string | null
  completed: boolean
}

export class UrlMigrationService {
  private status: UrlMigrationStatus = {
    isRunning: false,
    progress: 0,
    currentTable: "",
    totalTables: 0,
    processedTables: 0,
    totalUpdates: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    error: null,
    completed: false,
  }

  getStatus(): UrlMigrationStatus {
    return { ...this.status }
  }

  private updateStatus(updates: Partial<UrlMigrationStatus>) {
    this.status = { ...this.status, ...updates }
  }

  async migrateAllUrls(supabase: SupabaseClient, onProgress?: (status: UrlMigrationStatus) => void): Promise<void> {
    if (this.status.isRunning) {
      throw new Error("URL migration is already running")
    }

    try {
      this.updateStatus({
        isRunning: true,
        progress: 0,
        currentTable: "Инициализация...",
        totalTables: 0,
        processedTables: 0,
        totalUpdates: 0,
        successfulUpdates: 0,
        failedUpdates: 0,
        error: null,
        completed: false,
      })

      onProgress?.(this.status)

      // Все таблицы и колонки с URL изображений
      const urlTables = [
        { table: "wardrobe_items", column: "image_url" },
        { table: "wardrobe_user_items", column: "image_url" },
        { table: "basic_wardrobe_items", column: "image_url" },
        { table: "outfits", column: "image_url" },
        { table: "user_looks", column: "image_url" },
        { table: "user_profiles", column: "avatar_url" },
        { table: "user_profiles", column: "profile_image" },
        { table: "looks_sections", column: "image_url" },
        { table: "inspiration_outfits", column: "image_url" },
        { table: "outfit_items", column: "image_url" },
      ]

      this.updateStatus({
        totalTables: urlTables.length,
        currentTable: "Начинаем миграцию URL...",
      })
      onProgress?.(this.status)

      let totalUpdates = 0
      let successfulUpdates = 0
      let failedUpdates = 0

      for (let i = 0; i < urlTables.length; i++) {
        const { table, column } = urlTables[i]

        this.updateStatus({
          currentTable: `Обработка ${table}.${column}`,
          processedTables: i,
        })
        onProgress?.(this.status)

        try {
          // Получаем все записи с blob URL
          const { data: records, error: selectError } = await supabase
            .from(table)
            .select(`id, ${column}`)
            .like(column, "%blob.vercel-storage.com%")

          if (selectError) {
            if (selectError.message.includes("does not exist")) {
              console.log(`⚠️ Table/column ${table}.${column} does not exist, skipping...`)
              continue
            }
            throw selectError
          }

          if (!records || records.length === 0) {
            console.log(`📭 No blob URLs found in ${table}.${column}`)
            continue
          }

          console.log(`🔄 Updating ${records.length} URLs in ${table}.${column}`)
          totalUpdates += records.length

          // Обновляем URL по одной записи
          for (const record of records) {
            const oldUrl = record[column]
            if (!oldUrl || typeof oldUrl !== "string") continue

            // Заменяем blob URL на Yandex S3 URL
            const newUrl = this.convertBlobToYandexUrl(oldUrl)

            try {
              const { error: updateError } = await supabase
                .from(table)
                .update({ [column]: newUrl })
                .eq("id", record.id)

              if (updateError) {
                console.error(`❌ Failed to update ${table}.${column} for id ${record.id}:`, updateError)
                failedUpdates++
              } else {
                console.log(`✅ Updated ${table}.${column} for id ${record.id}: ${oldUrl} -> ${newUrl}`)
                successfulUpdates++
              }
            } catch (error) {
              console.error(`❌ Error updating ${table}.${column} for id ${record.id}:`, error)
              failedUpdates++
            }
          }
        } catch (error) {
          console.error(`❌ Error processing table ${table}.${column}:`, error)
          failedUpdates += 1
        }

        // Обновляем прогресс
        const progress = Math.round(((i + 1) / urlTables.length) * 100)
        this.updateStatus({
          progress,
          processedTables: i + 1,
          totalUpdates,
          successfulUpdates,
          failedUpdates,
        })
        onProgress?.(this.status)
      }

      // Завершение миграции
      this.updateStatus({
        isRunning: false,
        completed: true,
        progress: 100,
        currentTable: `Миграция завершена! Обновлено: ${successfulUpdates}, Ошибок: ${failedUpdates}`,
      })
      onProgress?.(this.status)

      console.log(`🎉 URL migration completed!`)
      console.log(`✅ Successful updates: ${successfulUpdates}`)
      console.log(`❌ Failed updates: ${failedUpdates}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("💥 URL migration failed:", errorMessage)

      this.updateStatus({
        isRunning: false,
        error: errorMessage,
        currentTable: `Ошибка миграции: ${errorMessage}`,
      })
      onProgress?.(this.status)

      throw error
    }
  }

  private convertBlobToYandexUrl(blobUrl: string): string {
    try {
      // Извлекаем путь файла из blob URL
      const url = new URL(blobUrl)
      const pathParts = url.pathname.split("/")
      const fileName = pathParts[pathParts.length - 1]

      // Если есть папки в пути, сохраняем их
      let filePath = fileName
      if (pathParts.length > 2) {
        const folders = pathParts.slice(1, -1).join("/")
        filePath = `${folders}/${fileName}`
      }

      // Возвращаем новый Yandex S3 URL
      return `https://storage.yandexcloud.net/modemorphs3/${filePath}`
    } catch (error) {
      console.error("Error converting blob URL:", error)
      // Если не можем распарсить, возвращаем оригинальный URL
      return blobUrl
    }
  }
}
