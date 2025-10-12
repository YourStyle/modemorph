import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { uploadToYandexS3 } from "@/lib/yandex-s3"
import { nanoid } from "nanoid"

export const maxDuration = 300 // 5 минут

interface ResponseItem {
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
}

interface ItemWithImage extends ResponseItem {
  finalImageUrl?: string
}

// Скачать изображение и загрузить в S3
async function downloadAndUploadImage(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error("Failed to download image")
    }

    const blob = await response.blob()
    const buffer = await blob.arrayBuffer()

    // Создаем уникальное имя файла
    const fileName = `upload-${nanoid(8)}.jpg`
    const contentType = blob.type || "image/jpeg"

    // Загружаем в S3
    const result = await uploadToYandexS3(buffer, fileName, contentType)

    if (!result.success) {
      throw new Error(result.error || "Failed to upload image")
    }

    return result.url || ""
  } catch (error) {
    console.error("Error downloading and uploading image:", error)
    throw error
  }
}

// Загрузить изображения для всех items
async function loadBasicItemImages(items: ResponseItem[]): Promise<ItemWithImage[]> {
  const jobs = items.map(async (item) => {
    let finalImageUrl = item.image_url || item.img_url

    try {
      // Если есть img_url (может быть base64 или обычный URL), загружаем в S3
      if (item.img_url && !item.image_url) {
        finalImageUrl = await downloadAndUploadImage(item.img_url)
      } else if (item.basic_item_id && !finalImageUrl) {
        // Если есть basic_item_id, но нет изображения, получаем из базы
        const supabase = await createClient()
        const { data: basicItem } = await supabase
          .from("basic_items")
          .select("image_url")
          .eq("id", item.basic_item_id)
          .single()

        if (basicItem?.image_url) {
          finalImageUrl = basicItem.image_url
        }
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

export async function POST(request: Request) {
  try {
    // Получаем текущего пользователя
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // AI API URL
    const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"

    // Анализируем каждый файл
    const analysisPromises = files.map(async (file) => {
      const fileFormData = new FormData()
      fileFormData.append("image", file)

      try {
        const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
          method: "POST",
          body: fileFormData,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          throw new Error(`AI API error: ${response.status}`)
        }

        const data = await response.json()
        return { success: true, data }
      } catch (error) {
        console.error("Error analyzing photo:", error)
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
      }
    })

    const results = await Promise.all(analysisPromises)

    // Собираем все успешные результаты
    const allItems: ResponseItem[] = []
    for (const result of results) {
      if (result.success && Array.isArray(result.data)) {
        allItems.push(...result.data)
      }
    }

    // Загружаем изображения для всех items
    const itemsWithImages = await loadBasicItemImages(allItems)

    // Возвращаем результаты
    return NextResponse.json({
      success: true,
      items: itemsWithImages,
      totalFiles: files.length,
      successfulAnalyses: results.filter((r) => r.success).length,
    })
  } catch (error) {
    console.error("Error in analyze-photos API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze photos" },
      { status: 500 }
    )
  }
}
