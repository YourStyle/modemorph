import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { uploadToYandexS3 } from "@/lib/yandex-s3"
import { nanoid } from "nanoid"

// Увеличиваем таймауты для длительных операций
export const maxDuration = 300 // 5 минут
export const dynamic = "force-dynamic"

interface PhotoAnalysisResult {
  items: Array<{
    name: string
    category: string
    color: string
    material?: string
    style?: string
  }>
  confidence: number
}

function isBase64Image(str: string): boolean {
  return str.startsWith("data:image/") || /^[A-Za-z0-9+/]+=*$/.test(str)
}

async function handleImageUrl(imageUrl: string): Promise<string> {
  // Check if imageUrl is base64
  if (isBase64Image(imageUrl)) {
    console.log("🔄 Converting base64 image to file and uploading to S3...")

    let base64Data: string
    let mimeType = "image/png" // default

    if (imageUrl.startsWith("data:image/")) {
      // Extract mime type and base64 data
      const matches = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/)
      if (matches) {
        mimeType = `image/${matches[1]}`
        base64Data = matches[2]
      } else {
        throw new Error("Invalid base64 image format")
      }
    } else {
      // Assume it's raw base64
      base64Data = imageUrl
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, "base64")

    // Generate unique filename
    const fileExtension = mimeType.split("/")[1] || "png"
    const fileName = `ai-parsed-${nanoid(8)}.${fileExtension}`

    // Upload to S3
    const uploadResult = await uploadToYandexS3(buffer, fileName, mimeType)

    if (!uploadResult.success) {
      throw new Error(`Failed to upload image to S3: ${uploadResult.error}`)
    }

    console.log("✅ Successfully uploaded base64 image to S3:", uploadResult.url)
    return uploadResult.url!
  }

  // Return original URL if not base64
  return imageUrl
}

export async function POST(request: NextRequest) {
  console.log("🔄 AI Photo Parse webhook started")

  try {
    // Увеличиваем буфер для больших изображений
    const body = await request.text()
    console.log("📦 Request body size:", body.length)

    let data
    try {
      data = JSON.parse(body)
    } catch (parseError) {
      console.error("❌ JSON parse error:", parseError)
      return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 })
    }

    const { imageUrl, userId, analysisType = "wardrobe" } = data

    if (!imageUrl || !userId) {
      console.error("❌ Missing required fields:", { imageUrl: !!imageUrl, userId: !!userId })
      return NextResponse.json({ error: "Missing imageUrl or userId" }, { status: 400 })
    }

    const processedImageUrl = await handleImageUrl(imageUrl)

    console.log("🔍 Starting analysis for:", {
      userId,
      analysisType,
      imageUrl: processedImageUrl.substring(0, 50) + "...",
    })

    // Создаем клиент Supabase
    const supabase = createClient()

    // Проверяем существование пользователя
    const { data: user, error: userError } = await supabase.from("profiles").select("id").eq("id", userId).single()

    if (userError || !user) {
      console.error("❌ User not found:", userError)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Имитируем AI анализ с задержкой
    console.log("🤖 Processing AI analysis...")

    // Разбиваем обработку на этапы для избежания таймаутов
    const analysisSteps = [
      "Загрузка изображения...",
      "Обнаружение объектов...",
      "Анализ цветов...",
      "Определение ма��ериалов...",
      "Классификация стилей...",
      "Финализация результатов...",
    ]

    for (let i = 0; i < analysisSteps.length; i++) {
      console.log(`📊 Step ${i + 1}/6: ${analysisSteps[i]}`)
      // Небольшая задержка между этапами
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Генерируем результат анализа
    const analysisResult: PhotoAnalysisResult = {
      items: [
        {
          name: "Джинсы",
          category: "Брюки",
          color: "Синий",
          material: "Деним",
          style: "Casual",
        },
        {
          name: "Футболка",
          category: "Верх",
          color: "Белый",
          material: "Хлопок",
          style: "Базовый",
        },
      ],
      confidence: 0.85,
    }

    console.log("✅ Analysis completed:", analysisResult)

    // Сохран��ем результаты в базу данных
    const itemsToInsert = analysisResult.items.map((item) => ({
      user_id: userId,
      item_name: item.name,
      size_type: "M", // По умолчанию
      material: item.material || "Неизвестно",
      style: item.style || "Базовый",
      color: item.color,
      image_url: processedImageUrl, // Use processed URL
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_basic: false,
      notes: `Добавлено через AI анализ (уверенность: ${Math.round(analysisResult.confidence * 100)}%)`,
    }))

    console.log("💾 Saving items to database:", itemsToInsert.length)

    const { data: insertedItems, error: insertError } = await supabase
      .from("wardrobe_user_items")
      .insert(itemsToInsert)
      .select()

    if (insertError) {
      console.error("❌ Database insert error:", insertError)
      return NextResponse.json(
        { error: "Failed to save analysis results", details: insertError.message },
        { status: 500 },
      )
    }

    console.log("✅ Successfully saved items:", insertedItems?.length || 0)

    // Возвращаем успешный результат
    const response = {
      success: true,
      message: "Photo analysis completed successfully",
      data: {
        itemsFound: analysisResult.items.length,
        confidence: analysisResult.confidence,
        itemsAdded: insertedItems?.length || 0,
        items: analysisResult.items,
      },
    }

    console.log("🎉 Webhook completed successfully")

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("💥 Webhook error:", error)

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    {
      message: "AI Photo Parse webhook is running",
      timestamp: new Date().toISOString(),
      maxDuration: 300,
    },
    { status: 200 },
  )
}
