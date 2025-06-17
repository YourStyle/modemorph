import { NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function POST(request: Request) {
  try {
    const { itemName } = await request.json()

    if (!itemName) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 })
    }

    // Получаем список изображений из Blob
    const { blobs } = await list()
    const imageBlobs = blobs.filter((blob) => blob.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i))

    // Ищем подходящее изображение
    const matchingImage = imageBlobs.find((blob) => {
      const fileName = blob.pathname.split("/").pop()?.toLowerCase()
      const cleanItemName = itemName.toLowerCase().replace(/[^a-z0-9-_]/g, "")
      return fileName?.startsWith(cleanItemName)
    })

    return NextResponse.json({
      imageUrl: matchingImage?.url || null,
    })
  } catch (error) {
    console.error("Error matching image:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
