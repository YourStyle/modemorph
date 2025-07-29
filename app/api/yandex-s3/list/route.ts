import { NextResponse } from "next/server"
import { listYandexS3Files } from "@/lib/yandex-s3"

export async function GET() {
  try {
    console.log("GET /api/yandex-s3/list called")

    const result = await listYandexS3Files()

    console.log("List result:", result)

    if (result.success) {
      return NextResponse.json({
        success: true,
        files: result.files || [],
      })
    } else {
      return NextResponse.json({ error: result.error || "List failed" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error listing Yandex S3 files:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
