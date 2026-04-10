import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import {
  openrouterChat,
  bufferToBase64,
  uploadBase64ToS3,
} from "@/lib/openrouter"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetectedItem {
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
  part: string
  description_en: string
  image_url: string | null
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const DETECTION_PROMPT = `Analyze this photo and detect ALL clothing items and accessories the person is wearing.
For each item return a JSON object with these fields:
- "clothing_item": item type in English, must be one of: blouse, lonsleeve, shirt, t-shirt, tank-top, cardigan, hoodie, pullover, suit-jacket, sweatshirt, turtleneck, vest, dress, skirt, jeans, pants, sporty-pants, coat, parka, puffer-jacket, classic, tracksuit, knitted-suit. For shoes use "shoes", for accessories use the item name in English.
- "item_name": item name in Russian (e.g. "Серая футболка")
- "description": brief description in Russian
- "description_en": detailed description in English including color, material, texture, pattern, and all visible details. This will be used to generate a product image.
- "material": material in Russian (e.g. "Хлопок", "Деним", "Кожа")
- "style": style in Russian (e.g. "Повседневный", "Деловой", "Спортивный")
- "color": primary color in Russian
- "shade": shade/tone in Russian (e.g. "Светло-серый", "Тёмно-синий")
- "has_print": "yes" or "no"
- "has_details": "yes" or "no"
- "part": one of "upper", "lower", "dress", "footwear", "accessories"

Return ONLY a valid JSON array, no markdown, no backticks, no other text.`

function buildItemImagePrompt(item: DetectedItem): string {
  const COMMON =
    "Top-down studio flat-lay on a neutral light-grey background. " +
    "No model, mannequin, props, logos, tags, or text. " +
    "Render exact described colors and material texture under soft, even lighting. " +
    "High resolution, crisp edges, no strong shadows."
  const NEG =
    "Avoid hangers, clips, plastic, stands, boxes, hands, body parts, watermarks, and any text."

  const desc = item.description_en

  if (item.part === "lower") {
    return [
      `Studio-quality flat-lay of a single pair of ${item.clothing_item}.`,
      desc,
      "Lay perfectly flat: both legs straight and parallel; hems aligned and flat; waistband perfectly horizontal; no creases or folds.",
      COMMON,
      NEG,
    ].join(" ")
  }

  if (item.part === "upper") {
    return [
      `Studio-quality flat-lay of a single ${item.clothing_item}.`,
      desc,
      "Lay perfectly flat and symmetrical: sleeves/lapels extended, all parts fully visible and unfolded; edges crisp; no creases.",
      COMMON,
      NEG,
    ].join(" ")
  }

  if (item.part === "dress") {
    return [
      `Studio-quality flat-lay of a single ${item.clothing_item}.`,
      desc,
      "Show full length from neckline to hem; sleeves (if any) extended symmetrically; waistline straight; hem aligned and flat; no creases.",
      COMMON,
      NEG,
    ].join(" ")
  }

  if (
    item.part === "footwear" ||
    /shoes|boots|sneakers|heels|loafers|sandals/i.test(item.clothing_item)
  ) {
    return [
      `Studio-quality flat-lay of a matched pair of ${item.clothing_item}.`,
      desc,
      "Arrange two distinct shoes (left and right), mirror-symmetric; toes pointing up, heels down; 2–3 cm gap; both fully visible and uncropped.",
      "If laces exist, tie neatly; lace color and any component colors must exactly match the description.",
      COMMON,
      "Avoid single shoe, mismatched pair, cutaway foot-shape, or deformed silhouette.",
      NEG,
    ].join(" ")
  }

  if (item.part === "accessories") {
    if (/bag|handbag|backpack|tote|crossbody/i.test(item.clothing_item)) {
      return [
        `Studio-quality flat-lay of a single ${item.clothing_item}.`,
        desc,
        "Show the front fully and centered; strap arranged as a smooth arc; hardware visible and aligned.",
        COMMON,
        NEG,
      ].join(" ")
    }
    if (/belt/i.test(item.clothing_item)) {
      return [
        `Studio-quality flat-lay of a single ${item.clothing_item}.`,
        desc,
        "Arrange as a neat closed loop or straight horizontal line; buckle centered and facing up.",
        COMMON,
        NEG,
      ].join(" ")
    }
    if (/sunglasses|glasses/i.test(item.clothing_item)) {
      return [
        `Studio-quality flat-lay of a single ${item.clothing_item}.`,
        desc,
        "Place front-facing with temples slightly opened and symmetric; lenses clean and glare-free.",
        COMMON,
        NEG,
      ].join(" ")
    }
    return [
      `Studio-quality flat-lay of a single ${item.clothing_item}.`,
      desc,
      "Isolate and center with a clean, symmetric arrangement; edges crisp.",
      COMMON,
      NEG,
    ].join(" ")
  }

  // Fallback
  return [
    `Studio-quality flat-lay of a single ${item.clothing_item}.`,
    desc,
    "Item laid perfectly flat and symmetrically with all parts fully visible; edges crisp.",
    COMMON,
    NEG,
  ].join(" ")
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Accept FormData with "image" field (same as /ai-photo-parse)
    const formData = await request.formData()
    const imageFile = formData.get("image") as File | null

    if (!imageFile) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 })
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    const mimeType = imageFile.type || "image/jpeg"
    const imageBase64 = bufferToBase64(imageBuffer, mimeType)

    // -----------------------------------------------------------------------
    // Step 1: Detect clothing items using cheap vision model (~$0.0004)
    // -----------------------------------------------------------------------
    console.log("[detect-clothing] Step 1: detecting items...")

    const detectionResult = await openrouterChat({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DETECTION_PROMPT },
            { type: "image_url", image_url: { url: imageBase64 } },
          ],
        },
      ],
      temperature: 0.1,
    })

    const rawContent = detectionResult.choices?.[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json(
        [{ acceptable: false, reason: "Не удалось распознать одежду на фото" }],
      )
    }

    // Parse JSON from response (strip markdown fences if present)
    let detectedItems: DetectedItem[]
    try {
      const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
      detectedItems = JSON.parse(cleaned)
    } catch {
      console.error("[detect-clothing] Failed to parse detection response:", rawContent.slice(0, 500))
      return NextResponse.json(
        [{ acceptable: false, reason: "Не удалось распознать одежду на фото" }],
      )
    }

    if (!Array.isArray(detectedItems) || detectedItems.length === 0) {
      return NextResponse.json(
        [{ acceptable: false, reason: "Не найдено предметов одежды на фото" }],
      )
    }

    console.log(`[detect-clothing] Found ${detectedItems.length} item(s), generating images...`)

    // -----------------------------------------------------------------------
    // Step 2: Generate product images in parallel (~$0.068 each)
    // -----------------------------------------------------------------------
    const imagePromises = detectedItems.map(async (item, index) => {
      try {
        const itemPrompt = buildItemImagePrompt(item)

        const imageResult = await openrouterChat({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: itemPrompt },
                { type: "image_url", image_url: { url: imageBase64 } },
              ],
            },
          ],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: "1:1" },
        })

        const images = imageResult.choices?.[0]?.message?.images
        if (!images || images.length === 0) return null

        // Upload to S3
        const dataUri = images[0].image_url.url
        if (dataUri.startsWith("data:image/")) {
          try {
            return await uploadBase64ToS3(dataUri, "detected")
          } catch (err) {
            console.error(`[detect-clothing] S3 upload failed for item ${index}:`, err)
            return dataUri // fallback to base64
          }
        }
        return dataUri
      } catch (err) {
        console.error(`[detect-clothing] Image generation failed for item ${index}:`, err)
        return null
      }
    })

    const imageUrls = await Promise.all(imagePromises)

    // -----------------------------------------------------------------------
    // Step 3: Build response in frontend-compatible format
    // -----------------------------------------------------------------------
    const responseItems = detectedItems.map((item, index) => ({
      index,
      basic_item_id: null,
      need_gen: false,
      clothing_item: item.clothing_item,
      description: item.description,
      item_name: item.item_name,
      material: item.material,
      style: item.style,
      has_print: item.has_print || "no",
      color: item.color,
      shade: item.shade,
      has_details: item.has_details || "no",
      image_url: imageUrls[index] || null,
      img_url: imageUrls[index] || null,
    }))

    console.log(
      `[detect-clothing] Done: ${responseItems.length} items, ` +
        `${imageUrls.filter(Boolean).length} images generated`,
    )

    return NextResponse.json(responseItems)
  } catch (error) {
    console.error("[detect-clothing] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    if (message.includes("OPENROUTER_API_KEY")) {
      return NextResponse.json({ error: "Сервис распознавания не настроен" }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
