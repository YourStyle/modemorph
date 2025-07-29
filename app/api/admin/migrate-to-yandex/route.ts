import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { YandexMigrationService } from "@/lib/yandex-migration"

// Глобальная переменная для хранения состояния миграции
let migrationStatus = {
  isRunning: false,
  progress: 0,
  currentFile: "Готов к запуску",
  totalFiles: 0,
  processedFiles: 0,
  successfulFiles: 0,
  failedFiles: [] as string[],
  skippedFiles: 0,
  error: null as string | null,
  completed: false,
  startTime: null as number | null,
  currentBatch: 0,
  totalBatches: 0,
  filesPerMinute: 0,
  smallFiles: 0,
  mediumFiles: 0,
  largeFiles: 0,
}

export async function GET() {
  return NextResponse.json(migrationStatus)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { retryFailed = false } = body

    if (migrationStatus.isRunning) {
      return NextResponse.json({ error: "Migration is already running" }, { status: 400 })
    }

    // Запускаем миграцию в фоне
    startMigrationProcess(retryFailed)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error starting Yandex migration:", error)
    return NextResponse.json({ error: "Failed to start migration" }, { status: 500 })
  }
}

async function startMigrationProcess(retryFailed: boolean) {
  const supabase = createClient()
  const migrationService = new YandexMigrationService()

  try {
    // Сбрасываем статус
    migrationStatus = {
      isRunning: true,
      progress: 0,
      currentFile: "Инициализация миграции...",
      totalFiles: 0,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: retryFailed ? migrationStatus.failedFiles : [],
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
    }

    // Запускаем миграцию
    await migrationService.migrateAllImages(
      supabase,
      retryFailed ? migrationStatus.failedFiles : undefined,
      (status) => {
        // Обновляем глобальный статус
        migrationStatus = { ...migrationStatus, ...status }
      },
    )

    // Завершаем миграцию
    migrationStatus.isRunning = false
    migrationStatus.completed = true
    migrationStatus.currentFile = `Миграция завершена! Обработано ${migrationStatus.successfulFiles} файлов`
  } catch (error) {
    console.error("Migration error:", error)
    migrationStatus.isRunning = false
    migrationStatus.error = error instanceof Error ? error.message : "Unknown error"
    migrationStatus.currentFile = "Ошибка миграции"
  }
}
