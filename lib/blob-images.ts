import { list, put } from "@vercel/blob"
import { nanoid } from "nanoid"

export async function getBlobImages() {
  try {
    const { blobs } = await list({
      token: process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN,
    })
    return blobs.filter((blob) => blob.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i))
  } catch (error) {
    console.error("Error fetching blob images:", error)
    return []
  }
}

export function matchImageToItem(itemName: string, blobImages: any[]) {
  // Ищем изображение, которое начинается с item_name
  const matchingImage = blobImages.find((blob) => {
    const fileName = blob.pathname.split("/").pop()?.toLowerCase()
    const cleanItemName = itemName.toLowerCase().replace(/[^a-z0-9-_]/g, "")
    return fileName?.startsWith(cleanItemName)
  })

  return matchingImage?.url || null
}

export async function getWardrobeItemsWithImages() {
  const { getWardrobeItems } = await import("@/lib/wardrobe")

  try {
    const [items, blobImages] = await Promise.all([getWardrobeItems(), getBlobImages()])

    return items.map((item) => ({
      ...item,
      image_url: matchImageToItem(item.item_name, blobImages),
    }))
  } catch (error) {
    console.error("Error getting wardrobe items with images:", error)
    return []
  }
}

/**
 * Загружает файл в Vercel Blob Storage
 * @param file Файл для загрузки
 * @param prefix Префикс для имени файла (например, 'basic-items')
 * @returns Объект с результатом загрузки
 */
export async function uploadToBlob(file: File, prefix = "") {
  try {
    if (!file) {
      throw new Error("No file provided")
    }

    // Проверяем наличие токена
    if (!process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN) {
      throw new Error("BLOB_MODEMORPH_READ_WRITE_TOKEN environment variable is not configured")
    }

    // Создаем уникальное имя файла
    const fileName = `${prefix ? prefix + "-" : ""}${nanoid(8)}`
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const fullFileName = `${fileName}.${fileExtension}`

    // Загружаем файл в Vercel Blob
    const blob = await put(fullFileName, file, {
      access: "public",
      token: process.env.BLOB_MODEMORPH_READ_WRITE_TOKEN,
    })

    return {
      success: true,
      url: blob.url,
      fileName: fullFileName,
    }
  } catch (error) {
    console.error("Error uploading to blob:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
