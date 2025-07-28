import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { BlobMigrationService } from "@/lib/blob-migration"

export async function POST(request: Request) {
  try {
    const supabase = createClient()

    // Проверяем, что пользователь админ
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("user_profiles").select("isAdmin").eq("id", user.id).single()

    if (!profile?.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { retryOnly = false } = body

    const migrationService = BlobMigrationService.getInstance()

    // Запускаем миграцию в фоновом режиме
    migrationService.startMigration(retryOnly).catch((error) => {
      console.error("Migration failed:", error)
    })

    return NextResponse.json({
      success: true,
      message: retryOnly ? "Retry migration started" : "Migration started",
    })
  } catch (error) {
    console.error("Error starting migration:", error)
    return NextResponse.json({ error: "Failed to start migration" }, { status: 500 })
  }
}
