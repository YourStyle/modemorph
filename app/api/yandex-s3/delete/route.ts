import { type NextRequest, NextResponse } from "next/server"
import { deleteFromYandexS3 } from "@/lib/yandex-s3"

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get("key")

    console.log("DELETE /api/yandex-s3/delete called with key:", key)

    if (!key) {
      return NextResponse.json({ error: "No key provided" }, { status: 400 })
    }

    const result = await deleteFromYandexS3(key)

    console.log("Delete result:", result)

    if (result.success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: result.error || "Delete failed" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error deleting from Yandex S3:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
