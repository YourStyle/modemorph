import { type NextRequest, NextResponse } from "next/server"
import { uploadToYandexS3 } from "@/lib/yandex-s3"
import { nanoid } from "nanoid"

export async function POST(request: NextRequest) {
  try {
    console.log("POST /api/upload-to-yandex called")

    const formData = await request.formData()
    console.log("FormData received")

    const file = formData.get("file") as File
    const prefix = (formData.get("prefix") as string) || ""

    console.log("Extracted data:", {
      file: file ? { name: file.name, size: file.size, type: file.type } : null,
      prefix,
    })

    if (!file) {
      console.error("No file provided in FormData")
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!(file instanceof File)) {
      console.error("Invalid file object:", typeof file)
      return NextResponse.json({ error: "Invalid file object" }, { status: 400 })
    }

    // Проверяем размер файла (максимум 10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.error("File too large:", file.size)
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    // Генерируем уникальное имя файла
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const fileName = `${prefix ? prefix + "/" : ""}${nanoid()}.${fileExtension}`

    console.log("Generated filename:", fileName)

    // Конвертируем File в ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    console.log("File converted to ArrayBuffer, size:", arrayBuffer.byteLength)

    // Загружаем файл в Yandex S3
    const result = await uploadToYandexS3(arrayBuffer, fileName, file.type)

    console.log("Upload result:", result)

    if (result.success) {
      return NextResponse.json({
        success: true,
        url: result.url,
        fileName: fileName,
      })
    } else {
      console.error("Upload failed:", result.error)
      return NextResponse.json({ error: result.error || "Upload failed" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error uploading to Yandex S3:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
