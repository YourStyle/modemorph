import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { nanoid } from "nanoid"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Blob token not configured" }, { status: 500 })
    }

    // Создаем уникальное имя файла
    const fileName = `upload-${nanoid(8)}`
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const fullFileName = `${fileName}.${fileExtension}`

    // Загружаем файл в Vercel Blob
    const blob = await put(fullFileName, file, {
      access: "public",
      token: process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN,
    })

    return NextResponse.json({
      success: true,
      url: blob.url,
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
