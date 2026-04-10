import { type NextRequest, NextResponse } from "next/server"
import {
  getPartnerFromToken,
  checkRateLimit,
  logApiUsage,
  apiError,
} from "@/lib/partner-token-auth"
import {
  openrouterChat,
  bufferToBase64,
  uploadBase64ToS3,
} from "@/lib/openrouter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const VALIDATION_MODEL = "google/gemini-2.5-flash-lite"
const VTON_MODEL = "google/gemini-3.1-flash-image-preview"

// ---------------------------------------------------------------------------
// Image validation prompts
// ---------------------------------------------------------------------------

const PERSON_VALIDATION_PROMPT = `Проанализируй это изображение. Это фотография реального человека, подходящая для виртуальной примерки одежды?

Требования:
- На фото один реальный человек (не рисунок, не манекен, не аватар)
- Хорошо видно лицо и верхнюю часть тела (стоя или по пояс)
- Нормальное качество фото (не слишком размытое, не слишком тёмное)

Ответь СТРОГО в формате JSON без markdown:
{"valid": true}
или
{"valid": false, "reason": "причина на русском языке"}

Примеры причин отказа:
- "На фото не обнаружен человек"
- "На фото несколько людей, нужен один человек"
- "Это рисунок или манекен, нужна реальная фотография"
- "Лицо не видно или обрезано"
- "Слишком низкое качество изображения"`

const CLOTHING_VALIDATION_PROMPT = `Проанализируй это изображение. Это фотография предмета одежды, подходящая для виртуальной примерки?

Требования:
- На фото видна одежда (не аксессуар, не обувь, не сумка)
- Одежда показана отдельно: flat-lay, на вешалке, на белом/нейтральном фоне
- НЕ фото человека в одежде (человек не должен быть в кадре)

Ответь СТРОГО в формате JSON без markdown:
{"valid": true}
или
{"valid": false, "reason": "причина на русском языке"}

Примеры причин отказа:
- "На фото не обнаружена одежда"
- "На фото человек в одежде — нужна фотография только вещи отдельно"
- "Это обувь/аксессуар, а не предмет одежды"
- "Слишком низкое качество изображения"`

const VTON_PROMPT = `Virtual try-on task.

The FIRST image is a reference photo of a person.
The SECOND image is a clothing item.

Generate a single photorealistic image of the SAME person from the first image
wearing the clothing item from the second image. Requirements:
- Preserve the person's face, hair, body shape, and proportions exactly.
- Use a natural pose and a clean, neutral background.
- The clothing must match the provided item photo in color, texture, and style.
- The result should look like a professional fashion photo.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function extractFile(
  formData: FormData,
  fieldName: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const file = formData.get(fieldName)
  if (!file || !(file instanceof File)) return null
  if (file.size > MAX_FILE_SIZE) return null
  if (!file.type.startsWith("image/")) return null

  const buffer = Buffer.from(await file.arrayBuffer())
  return { buffer, mimeType: file.type }
}

function parseValidationResponse(text: string): { valid: boolean; reason?: string } {
  try {
    // Strip potential markdown code fences
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
    return JSON.parse(clean)
  } catch {
    // If we can't parse, assume invalid for safety
    return { valid: false, reason: "Не удалось определить содержимое изображения" }
  }
}

async function validateImage(
  base64: string,
  prompt: string,
): Promise<{ valid: boolean; reason?: string }> {
  const result = await openrouterChat({
    model: VALIDATION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: base64 } },
        ],
      },
    ],
    temperature: 0,
  })

  const content = result.choices?.[0]?.message?.content
  if (!content) return { valid: false, reason: "Не удалось проанализировать изображение" }

  return parseValidationResponse(content)
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let partnerId = 0
  let tokenId = 0

  try {
    // 1. Authenticate via API key
    const tokenInfo = await getPartnerFromToken(request)
    if (!tokenInfo) {
      return apiError("INVALID_API_KEY", "Неверный или отсутствующий API ключ", 401)
    }
    partnerId = tokenInfo.partnerId
    tokenId = tokenInfo.tokenId

    // 2. Rate limiting
    const withinLimit = await checkRateLimit(tokenInfo.tokenId, tokenInfo.rateLimitPerMinute)
    if (!withinLimit) {
      await logApiUsage({
        partnerId,
        tokenId,
        endpoint: "/api/v1/vton",
        statusCode: 429,
        errorCode: "RATE_LIMIT_EXCEEDED",
        latencyMs: Date.now() - startTime,
      })
      return apiError(
        "RATE_LIMIT_EXCEEDED",
        `Превышен лимит запросов (${tokenInfo.rateLimitPerMinute}/мин). Повторите позже.`,
        429,
      )
    }

    // 3. Parse multipart form data
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError("INVALID_REQUEST", "Ожидается multipart/form-data с полями person_photo и clothing_photo", 400)
    }

    const personFile = await extractFile(formData, "person_photo")
    const clothingFile = await extractFile(formData, "clothing_photo")

    if (!personFile) {
      return apiError(
        "MISSING_PERSON_PHOTO",
        "Отсутствует или некорректное поле person_photo. Формат: JPEG/PNG, макс. 10 МБ.",
        400,
      )
    }
    if (!clothingFile) {
      return apiError(
        "MISSING_CLOTHING_PHOTO",
        "Отсутствует или некорректное поле clothing_photo. Формат: JPEG/PNG, макс. 10 МБ.",
        400,
      )
    }

    // 4. Convert to base64
    const personBase64 = bufferToBase64(personFile.buffer, personFile.mimeType)
    const clothingBase64 = bufferToBase64(clothingFile.buffer, clothingFile.mimeType)

    // 5. AI validation (parallel for speed)
    const [personValidation, clothingValidation] = await Promise.all([
      validateImage(personBase64, PERSON_VALIDATION_PROMPT),
      validateImage(clothingBase64, CLOTHING_VALIDATION_PROMPT),
    ])

    if (!personValidation.valid) {
      await logApiUsage({
        partnerId,
        tokenId,
        endpoint: "/api/v1/vton",
        statusCode: 422,
        errorCode: "INVALID_PERSON_PHOTO",
        latencyMs: Date.now() - startTime,
      })
      return apiError(
        "INVALID_PERSON_PHOTO",
        personValidation.reason || "Фото не подходит для примерки. Загрузите чёткую фотографию одного человека.",
        422,
      )
    }

    if (!clothingValidation.valid) {
      await logApiUsage({
        partnerId,
        tokenId,
        endpoint: "/api/v1/vton",
        statusCode: 422,
        errorCode: "INVALID_CLOTHING_PHOTO",
        latencyMs: Date.now() - startTime,
      })
      return apiError(
        "INVALID_CLOTHING_PHOTO",
        clothingValidation.reason || "Фото не содержит предмет одежды. Загрузите фото вещи на нейтральном фоне.",
        422,
      )
    }

    // 6. VTON generation
    console.log(`[Partner VTON] partner=${partnerId} token=${tokenId} — generating try-on`)

    const result = await openrouterChat({
      model: VTON_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VTON_PROMPT },
            { type: "image_url", image_url: { url: personBase64 } },
            { type: "image_url", image_url: { url: clothingBase64 } },
          ],
        },
      ],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "3:4" },
    })

    const images = result.choices?.[0]?.message?.images
    if (!images || images.length === 0) {
      await logApiUsage({
        partnerId,
        tokenId,
        endpoint: "/api/v1/vton",
        statusCode: 502,
        errorCode: "VTON_GENERATION_FAILED",
        latencyMs: Date.now() - startTime,
      })
      return apiError(
        "VTON_GENERATION_FAILED",
        "Модель не вернула изображение. Попробуйте другие фотографии.",
        502,
      )
    }

    // 7. Upload to S3
    let imageUrl = images[0].image_url.url
    if (imageUrl.startsWith("data:image/")) {
      try {
        imageUrl = await uploadBase64ToS3(imageUrl, "partner-vton")
      } catch (uploadErr) {
        console.error("[Partner VTON] S3 upload failed:", uploadErr)
      }
    }

    const latencyMs = Date.now() - startTime
    console.log(`[Partner VTON] partner=${partnerId} — success in ${latencyMs}ms`)

    if (result.usage?.cost) {
      console.log(`[Partner VTON] cost=$${result.usage.cost}, tokens=${result.usage.total_tokens}`)
    }

    // 8. Log success
    await logApiUsage({
      partnerId,
      tokenId,
      endpoint: "/api/v1/vton",
      statusCode: 200,
      latencyMs,
    })

    return NextResponse.json({
      success: true,
      result: { image_url: imageUrl },
    })
  } catch (error) {
    const latencyMs = Date.now() - startTime
    console.error("[Partner VTON] Error:", error)

    if (partnerId && tokenId) {
      await logApiUsage({
        partnerId,
        tokenId,
        endpoint: "/api/v1/vton",
        statusCode: 500,
        errorCode: "INTERNAL_ERROR",
        latencyMs,
      }).catch(() => {})
    }

    const message = error instanceof Error ? error.message : "Internal server error"
    const status = message.includes("OPENROUTER_API_KEY") ? 503 : 500
    return apiError("INTERNAL_ERROR", "Внутренняя ошибка сервера. Попробуйте позже.", status)
  }
}
