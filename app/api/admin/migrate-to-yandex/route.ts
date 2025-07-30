import { type NextRequest, NextResponse } from "next/server"

// Глобальное состояние миграции (в продакшене лучше использовать Redis)
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
  try {
    return NextResponse.json(migrationStatus)
  } catch (error) {
    console.error("Error getting migration status:", error)
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { retryFailed } = await request.json()

    if (migrationStatus.isRunning) {
      return NextResponse.json({ error: "Migration already running" }, { status: 400 })
    }

    // Сброс статуса
    migrationStatus = {
      ...migrationStatus,
      isRunning: true,
      progress: 0,
      currentFile: "Инициализация миграции...",
      error: null,
      completed: false,
      startTime: Date.now(),
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: retryFailed ? migrationStatus.failedFiles : [],
    }

    // Запуск миграции в фоне
    startMigrationProcess(retryFailed)

    return NextResponse.json({ message: "Migration started" })
  } catch (error) {
    console.error("Error starting migration:", error)
    return NextResponse.json({ error: "Failed to start migration" }, { status: 500 })
  }
}

async function startMigrationProcess(retryFailed: boolean) {
  try {
    // Имитация процесса миграции
    migrationStatus.currentFile = "Поиск файлов для миграции..."
    migrationStatus.totalFiles = retryFailed ? migrationStatus.failedFiles.length : 100
    migrationStatus.totalBatches = Math.ceil(migrationStatus.totalFiles / 10)

    for (let i = 0; i < migrationStatus.totalFiles; i++) {
      if (!migrationStatus.isRunning) break

      migrationStatus.currentFile = `Обработка файла ${i + 1}/${migrationStatus.totalFiles}`
      migrationStatus.processedFiles = i + 1
      migrationStatus.progress = Math.round(((i + 1) / migrationStatus.totalFiles) * 100)
      migrationStatus.currentBatch = Math.ceil((i + 1) / 10)

      // Имитация обработки файла
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Случайно помечаем как успешный или неудачный
      if (Math.random() > 0.1) {
        migrationStatus.successfulFiles++
      } else {
        migrationStatus.failedFiles.push(`file-${i + 1}.jpg`)
      }

      // Обновляем скорость
      const elapsed = (Date.now() - (migrationStatus.startTime || 0)) / 1000 / 60
      migrationStatus.filesPerMinute = Math.round(migrationStatus.processedFiles / elapsed)
    }

    migrationStatus.isRunning = false
    migrationStatus.completed = true
    migrationStatus.currentFile = "Миграция завершена"
  } catch (error) {
    migrationStatus.isRunning = false
    migrationStatus.error = error instanceof Error ? error.message : "Unknown error"
    migrationStatus.currentFile = "Ошибка миграции"
  }
}
