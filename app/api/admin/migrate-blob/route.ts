import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import { BlobMigrationService } from "@/lib/blob-migration"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для админских операций
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await req.json()
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
