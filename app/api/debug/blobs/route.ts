import { NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function GET() {
  try {
    console.log("🔍 Starting blob list request...")

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

    console.log("✅ Blob token found, listing blobs...")

    // Получаем список блобов с явным указанием токена
    const { blobs } = await list({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    console.log(`📁 Found ${blobs.length} total blobs`)

    const imageBlobs = blobs.filter((blob) => {
      const isImage = blob.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i)
      return isImage
    })

    console.log(`🖼️ Found ${imageBlobs.length} image blobs`)

    // Группируем по папкам
    const folderGroups = imageBlobs.reduce(
      (acc, blob) => {
        const folder = blob.pathname.includes("/") ? blob.pathname.split("/")[0] : "root"

        if (!acc[folder]) {
          acc[folder] = []
        }
        acc[folder].push(blob)
        return acc
      },
      {} as Record<string, typeof imageBlobs>,
    )

    console.log("📂 Folder groups:", Object.keys(folderGroups))

    return NextResponse.json({
      success: true,
      totalBlobs: blobs.length,
      imageBlobs: imageBlobs.length,
      folderGroups: Object.keys(folderGroups).map((folder) => ({
        folder,
        count: folderGroups[folder].length,
        files: folderGroups[folder].map((blob) => ({
          pathname: blob.pathname,
          url: blob.url,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
        })),
      })),
      allImages: imageBlobs.map((blob) => ({
        pathname: blob.pathname,
        url: blob.url,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      })),
    })
  } catch (error) {
    console.error("❌ Error in /api/debug/blobs:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    const errorStack = error instanceof Error ? error.stack : "No stack trace available"

    return NextResponse.json(
      {
        error: "Failed to list blobs",
        details: errorMessage,
        stack: errorStack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
