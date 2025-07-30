import { NextResponse } from "next/server"
import { CorruptedFilesFixer } from "@/lib/fix-corrupted-files"

export async function GET() {
  try {
    const fixer = CorruptedFilesFixer.getInstance()
    const progress = fixer.getProgress()

    if (progress.isRunning) {
      return NextResponse.json({
        status: "running",
        progress,
      })
    }

    // Получаем превью поврежденных файлов
    const preview = await fixer.getCorruptedFilesPreview()

    return NextResponse.json({
      status: "ready",
      preview,
      progress,
    })
  } catch (error) {
    console.error("Error getting corrupted files status:", error)
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const fixer = CorruptedFilesFixer.getInstance()

    if (fixer.getProgress().isRunning) {
      return NextResponse.json({ error: "Fix process is already running" }, { status: 400 })
    }

    // Запускаем исправление в фоне
    fixer.fixCorruptedFiles().catch((error) => {
      console.error("Background fix process failed:", error)
    })

    return NextResponse.json({
      message: "Corrupted files fix started",
      status: "started",
    })
  } catch (error) {
    console.error("Error starting corrupted files fix:", error)
    return NextResponse.json({ error: "Failed to start fix process" }, { status: 500 })
  }
}
