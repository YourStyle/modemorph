import { NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function POST(request: Request) {
  try {
    const { itemName } = await request.json()

    if (!itemName) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 })
    }

    console.log("🔍 Searching for image:", itemName)

    // Проверяем наличие токена
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("❌ BLOB_READ_WRITE_TOKEN not found")
      return NextResponse.json(
        {
          error: "Blob token not configured",
          details: "BLOB_READ_WRITE_TOKEN environment variable is missing",
        },
        { status: 500 },
      )
    }

    // Получаем список изображений из Blob с явным токеном
    const { blobs } = await list({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    console.log("📁 Total blobs found:", blobs.length)

    // Фильтруем только изображения из папки original
    const originalImageBlobs = blobs.filter((blob) => {
      const isImage = blob.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i)
      const isInOriginal = blob.pathname.includes("original/")
      return isImage && isInOriginal
    })

    console.log("🖼️ Original folder image blobs found:", originalImageBlobs.length)
    console.log(
      "📋 Original images list:",
      originalImageBlobs.map((b) => b.pathname),
    )

    // Очищаем имя для поиска
    const cleanItemName = itemName.toLowerCase().trim()
    console.log("🧹 Clean item name:", cleanItemName)

    // Ищем изображение, которое начинается с item_name
    const matchingImage = originalImageBlobs.find((blob) => {
      const fileName = blob.pathname.split("/").pop()?.toLowerCase()
      const startsWithItemName = fileName?.startsWith(cleanItemName)

      console.log(`🔎 Checking file: ${fileName} | Starts with "${cleanItemName}": ${startsWithItemName}`)

      return startsWithItemName
    })

    console.log("✅ Matching image found:", matchingImage?.pathname || "❌ NOT FOUND")

    return NextResponse.json({
      imageUrl: matchingImage?.url || null,
      debug: {
        itemName,
        cleanItemName,
        totalBlobs: blobs.length,
        originalImageBlobs: originalImageBlobs.length,
        foundMatch: !!matchingImage,
        matchedFile: matchingImage?.pathname || null,
        allOriginalFiles: originalImageBlobs.map((b) => b.pathname),
        searchPattern: `Looking for files starting with: ${cleanItemName}`,
      },
    })
  } catch (error) {
    console.error("❌ Error matching image:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    const errorStack = error instanceof Error ? error.stack : "No stack trace available"

    return NextResponse.json(
      {
        error: "Internal server error",
        details: errorMessage,
        stack: errorStack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
