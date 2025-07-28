import { NextResponse } from "next/server"
import { BlobMigrationService } from "@/lib/blob-migration"

export async function GET() {
  try {
    const migrationService = BlobMigrationService.getInstance()
    const status = migrationService.getStatus()

    return NextResponse.json(status)
  } catch (error) {
    console.error("Error getting migration status:", error)
    return NextResponse.json({ error: "Failed to get migration status" }, { status: 500 })
  }
}
