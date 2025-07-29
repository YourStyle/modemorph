import { type NextRequest, NextResponse } from "next/server"
import { listYandexS3Files } from "@/lib/yandex-s3"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const prefix = searchParams.get("prefix") || ""
    const maxKeys = Number.parseInt(searchParams.get("maxKeys") || "1000")

    console.log("GET /api/yandex-s3/list called with:", { prefix, maxKeys })

    const result = await listYandexS3Files(prefix, maxKeys)

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
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
