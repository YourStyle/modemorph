import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { list } from "@vercel/blob"

export async function GET() {
  try {
    console.log("🚀 Starting image URL population...")

    // Проверяем токен
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 500 })
    }

    const supabase = createClient()

    // Получаем все вещи из гардероба
    console.log("📦 Fetching wardrobe items...")
    const { data: items, error: itemsError } = await supabase.from("wardrobe_items").select("id, item_name, image_url")

    if (itemsError) {
      console.error("❌ Error fetching items:", itemsError)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    console.log(`📊 Found ${items?.length || 0} wardrobe items`)

    // Получаем все изображения из blob storage
    console.log("🖼️ Fetching blob images...")
    const { blobs } = await list({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // Фильтруем только изображения из папки original
    const originalImages = blobs.filter(
      (blob) => blob.pathname.includes("original/") && /\.(jpg|jpeg|png|webp|gif)$/i.test(blob.pathname),
    )

    console.log(`🎯 Found ${originalImages.length} images in original folder`)

    let processed = 0
    let found = 0
    let updated = 0
    let notFound = 0

    // Обрабатываем каждую вещь
    for (const item of items || []) {
      processed++

      // Пропускаем если уже есть image_url
      if (item.image_url) {
        console.log(`⏭️ Skipping ${item.item_name} - already has image_url`)
        continue
      }

      // Ищем соответствующее изображение
      const matchingImage = originalImages.find((blob) => {
        const fileName = blob.pathname.split("/").pop() || ""
        const cleanItemName = item.item_name.toLowerCase().trim()
        const cleanFileName = fileName.toLowerCase()

        // Проверяем начинается ли имя файла с item_name
        return cleanFileName.startsWith(cleanItemName)
      })

      if (matchingImage) {
        console.log(`✅ Found image for ${item.item_name}: ${matchingImage.url}`)

        // Обновляем запись в базе данных
        const { error: updateError } = await supabase
          .from("wardrobe_items")
          .update({ image_url: matchingImage.url })
          .eq("id", item.id)

        if (updateError) {
          console.error(`❌ Error updating ${item.item_name}:`, updateError)
        } else {
          found++
          updated++
        }
      } else {
        console.log(`❌ No image found for: ${item.item_name}`)
        notFound++
      }
    }

    const result = {
      processed,
      found,
      updated,
      notFound,
      message: `Migration completed: ${found} images found and linked`,
    }

    console.log("🎉 Migration completed:", result)
    return NextResponse.json(result)
  } catch (error) {
    console.error("💥 Migration error:", error)
    return NextResponse.json(
      {
        error: "Migration failed",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
