import { type NextRequest, NextResponse } from "next/server"
import { uploadToBlob } from "@/lib/blob-images"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const prefix = formData.get("prefix") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const result = await uploadToBlob(file, prefix)

    if (result.success) {
      return NextResponse.json({
        success: true,
        url: result.url,
        fileName: result.fileName,
      })
    } else {
      return NextResponse.json(
        {
          error: result.error,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("Error in upload API:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
