import { NextResponse } from "next/server"
import { uploadToYandexS3 } from "@/lib/yandex-s3"
import { nanoid } from "nanoid"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Создаем уникальное имя файла
    const fileName = `upload-${nanoid(8)}`
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const fullFileName = `${fileName}.${fileExtension}`

    // Конвертируем файл в ArrayBuffer
    const buffer = await file.arrayBuffer()
    const contentType = file.type || "image/jpeg"

    // Загружаем файл в Yandex S3
    const result = await uploadToYandexS3(buffer, fullFileName, contentType)

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to upload image" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      fileName: fullFileName,
    })
  } catch (error) {
    console.error("Error uploading image:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image" },
      { status: 500 },
    )
  }
}
