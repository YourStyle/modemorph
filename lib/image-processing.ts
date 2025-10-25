import { api } from "@/lib/api-client"

export interface ResponseItem {
  index: number
  basic_item_id: number | null
  need_gen: boolean
  clothing_item: string
  description: string
  item_name: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  img_url?: string
  image_url?: string
  part?: string
}

export interface ItemWithImage extends ResponseItem {
  finalImageUrl?: string
  isAdding?: boolean
  isAdded?: boolean
}

/**
 * Downloads an image from URL or converts base64 to file and uploads to S3
 */
export async function downloadAndUploadImage(imageUrl: string): Promise<string> {
  try {
    // Handle base64 images
    if (imageUrl.startsWith("data:image/") || /^[A-Za-z0-9+/]+=*$/.test(imageUrl)) {
      console.log("Processing base64 image...")

      let base64Data: string
      let mimeType = "image/jpeg"

      if (imageUrl.startsWith("data:image/")) {
        const matches = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
        if (matches) {
          mimeType = `image/${matches[1]}`
          base64Data = matches[2]
        } else {
          throw new Error("Invalid base64 image format")
        }
      } else {
        base64Data = imageUrl
      }

      // Convert base64 to blob
      const { Buffer } = await import("buffer")
      const buffer = Buffer.from(base64Data, "base64")
      const blob = new Blob([buffer], { type: mimeType })
      const file = new File([blob], "image.jpg", { type: mimeType })

      const formData = new FormData()
      formData.append("file", file)

      const uploadResult = await api.post("/api/upload-image", formData, {
        headers: {}, // Let browser set Content-Type with boundary
      })
      if (!uploadResult) {
        throw new Error("Failed to upload base64 image")
      }

      const { url } = uploadResult
      return url
    }

    // Handle regular URLs
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error("Failed to download image")
    }
    const blob = await response.blob()
    const file = new File([blob], "image.jpg", { type: blob.type })
    const formData = new FormData()
    formData.append("file", file)
    const uploadResult = await api.post("/api/upload-image", formData, {
      headers: {}, // Let browser set Content-Type with boundary
    })
    if (!uploadResult) {
      throw new Error("Failed to upload image")
    }
    const { url } = uploadResult
    return url
  } catch (error) {
    console.error("Error downloading and uploading image:", error)
    throw error
  }
}

/**
 * Processes items from AI response:
 * - Downloads and uploads base64 images to S3
 * - Fetches basic item images if basic_item_id is present
 * - Returns items with finalImageUrl field
 */
export async function loadBasicItemImages(items: ResponseItem[]): Promise<ItemWithImage[]> {
  const jobs = items.map(async (item) => {
    let finalImageUrl = item.image_url || item.img_url
    try {
      if (item.img_url && !item.image_url) {
        finalImageUrl = await downloadAndUploadImage(item.img_url)
      } else if (item.basic_item_id && !finalImageUrl) {
        const basicItem = await api.get(`/api/basic-items/${item.basic_item_id}`)
        finalImageUrl = basicItem.image_url
      }
    } catch (e) {
      console.error("Error loading image for item:", item.item_name, e)
    }
    return { ...item, finalImageUrl }
  })
  const settled = await Promise.allSettled(jobs)
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { ...items[i], finalImageUrl: items[i].image_url || items[i].img_url }
  )
}