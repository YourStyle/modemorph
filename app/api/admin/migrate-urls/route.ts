import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UrlMigrationService } from "@/lib/url-migration"

// Глобальная переменная для хранения состояния миграции URL
let urlMigrationService: UrlMigrationService | null = null

export async function GET() {
  try {
    if (!urlMigrationService) {
      urlMigrationService = new UrlMigrationService()
    }

    const status = urlMigrationService.getStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error("Error getting URL migration status:", error)
    return NextResponse.json({ error: "Failed to get migration status" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = createClient()

    if (!urlMigrationService) {
      urlMigrationService = new UrlMigrationService()
    }

    // Запускаем миграцию URL в фоне
    urlMigrationService.migrateAllUrls(supabase).catch((error) => {
      console.error("Background URL migration error:", error)
    })

    return NextResponse.json({
      success: true,
      message: "URL migration started",
    })
  } catch (error) {
    console.error("Error starting URL migration:", error)
    return NextResponse.json({ error: "Failed to start URL migration" }, { status: 500 })
  }
}
