import { NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function POST(request: Request) {
  try {
    const { itemName } = await request.json()

    if (!itemName) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 })
    }

    if (!process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Blob token not configured" }, { status: 500 })
    }

    const { blobs } = await list({
      token: process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN,
    })

    const originalImageBlobs = blobs.filter((blob) => {
      const isImage = blob.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i)
      const isInOriginal = blob.pathname.includes("original/")
      return isImage && isInOriginal
    })

    const cleanItemName = itemName.toLowerCase().trim()

    const matchingImage = originalImageBlobs.find((blob) => {
      const fileName = blob.pathname.split("/").pop()?.toLowerCase()
      return fileName?.startsWith(cleanItemName)
    })

    return NextResponse.json({
      imageUrl: matchingImage?.url || null,
    })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
