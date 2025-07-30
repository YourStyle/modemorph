import { NextResponse } from "next/server"

// Глобальное состояние исправления файлов
const fixStatus = {
  progress: {
    total: 0,
    processed: 0,
    corrupted: 0,
    fixed: 0,
    failed: 0,
    errors: [] as string[],
    isRunning: false,
  },
  preview: null as any,
}

export async function GET() {
  try {
    // Если превью еще не загружено, создаем его
    if (!fixStatus.preview) {
      fixStatus.preview = {
        corruptedCount: 15,
        totalFiles: 500,
        examples: [
          { key: "wardrobe/item-123.jpg", size: 75 },
          { key: "outfits/outfit-456.png", size: 75 },
          { key: "looks/look-789.jpg", size: 75 },
        ],
      }
    }

    return NextResponse.json(fixStatus)
  } catch (error) {
    console.error("Error getting fix status:", error)
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 })
  }
}

export async function POST() {
  try {
    if (fixStatus.progress.isRunning) {
      return NextResponse.json({ error: "Fix process already running" }, { status: 400 })
    }

    // Сброс статуса
    fixStatus.progress = {
      total: fixStatus.preview?.corruptedCount || 15,
      processed: 0,
      corrupted: fixStatus.preview?.corruptedCount || 15,
      fixed: 0,
      failed: 0,
      errors: [],
      isRunning: true,
    }

    // Запуск процесса исправления в фоне
    startFixProcess()

    return NextResponse.json({ message: "Fix process started" })
  } catch (error) {
    console.error("Error starting fix process:", error)
    return NextResponse.json({ error: "Failed to start fix process" }, { status: 500 })
  }
}

async function startFixProcess() {
  try {
    const total = fixStatus.progress.total

    for (let i = 0; i < total; i++) {
      if (!fixStatus.progress.isRunning) break

      fixStatus.progress.processed = i + 1

      // Имитация исправления файла
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Случайно помечаем как исправленный или неудачный
      if (Math.random() > 0.2) {
        fixStatus.progress.fixed++
      } else {
        fixStatus.progress.failed++
        fixStatus.progress.errors.push(`Failed to fix file-${i + 1}.jpg`)
      }
    }

    fixStatus.progress.isRunning = false
  } catch (error) {
    fixStatus.progress.isRunning = false
    fixStatus.progress.errors.push(error instanceof Error ? error.message : "Unknown error")
  }
}
