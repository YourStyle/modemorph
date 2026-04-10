import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Download an image URL and return it as a base64 data URI */
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") || "image/jpeg"
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString("base64")}`
  } catch (err) {
    console.error("VTON: failed to download image:", url, err)
    return null
  }
}

/** Upload a base64 data URI to Yandex S3 and return the public URL */
async function uploadBase64ToS3(dataUri: string): Promise<string> {
  const matches = dataUri.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches) throw new Error("Invalid base64 data URI format")

  const ext = matches[1] === "jpeg" ? "jpg" : matches[1]
  const buffer = Buffer.from(matches[2], "base64")

  const s3Client = new S3Client({
    region: "ru-central1",
    endpoint: "https://storage.yandexcloud.net",
    credentials: {
      accessKeyId: process.env.YANDEX_ACCESS_KEY_ID!,
      secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY!,
    },
  })
  const bucket = process.env.YANDEX_BUCKET_NAME!
  const key = `vton/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: `image/${matches[1]}`,
      ACL: "public-read",
    }),
  )

  return `https://storage.yandexcloud.net/${bucket}/${key}`
}

/** Build the text portion of the try-on prompt */
function buildPrompt(
  items: Array<{ name: string; description?: string; color?: string; material?: string }>,
): string {
  const itemDescriptions = items
    .map((item, i) => {
      const parts = [item.name]
      if (item.color) parts.push(item.color)
      if (item.material) parts.push(item.material)
      if (item.description) parts.push(item.description)
      return `  Clothing item ${i + 1}: ${parts.join(", ")}`
    })
    .join("\n")

  return [
    "Virtual try-on task.",
    "",
    "The FIRST image is a reference photo of a person.",
    "The REMAINING images are individual clothing items.",
    "",
    itemDescriptions,
    "",
    "Generate a single photorealistic image of the SAME person from the first image",
    "wearing ALL the provided clothing items together. Requirements:",
    "- Preserve the person's face, hair, body shape, and proportions exactly.",
    "- Use a natural pose and a clean, neutral background.",
    "- The clothing must match the provided item photos in color, texture, and style.",
    "- The result should look like a professional fashion photo.",
  ].join("\n")
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    // Get user avatar
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single()

    if (profileError || !profile?.avatar_url) {
      return NextResponse.json(
        { error: "User avatar not found. Please upload an avatar in your profile." },
        { status: 400 },
      )
    }

    // Download avatar → base64
    const avatarBase64 = await imageUrlToBase64(profile.avatar_url)
    if (!avatarBase64) {
      return NextResponse.json(
        { error: "Не удалось загрузить аватар. Попробуйте загрузить другое фото." },
        { status: 400 },
      )
    }

    // Download each clothing item image → base64
    const imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = []
    for (const item of items) {
      if (item.image_url) {
        const b64 = await imageUrlToBase64(item.image_url)
        if (b64) {
          imageContents.push({ type: "image_url", image_url: { url: b64 } })
        }
      }
    }

    if (imageContents.length === 0) {
      return NextResponse.json(
        { error: "Не удалось загрузить изображения вещей" },
        { status: 400 },
      )
    }

    const prompt = buildPrompt(items)

    console.log(
      `VTON: sending request to Gemini — avatar + ${imageContents.length} clothing item(s)`,
    )

    // Call OpenRouter Gemini 3.1 Flash Image
    const openrouterKey = process.env.OPENROUTER_API_KEY
    if (!openrouterKey) {
      console.error("VTON: OPENROUTER_API_KEY not configured")
      return NextResponse.json(
        { error: "Сервис примерки не настроен" },
        { status: 503 },
      )
    }

    const geminiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: avatarBase64 } },
              ...imageContents,
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error("VTON Gemini error:", geminiResponse.status, errorText)
      return NextResponse.json(
        { error: "Сервис примерки временно недоступен" },
        { status: 503 },
      )
    }

    const geminiResult = await geminiResponse.json()
    const message = geminiResult?.choices?.[0]?.message
    const images = message?.images as
      | Array<{ image_url: { url: string } }>
      | undefined

    if (!images || images.length === 0) {
      console.error("VTON: Gemini returned no images", JSON.stringify(geminiResult).slice(0, 500))
      return NextResponse.json(
        { error: "Модель не вернула изображение. Попробуйте ещё раз." },
        { status: 502 },
      )
    }

    // Take first generated image
    let imageData = images[0].image_url.url

    // Upload base64 to S3 for a persistent URL
    if (imageData.startsWith("data:image/")) {
      try {
        imageData = await uploadBase64ToS3(imageData)
        console.log("VTON: uploaded result to S3:", imageData)
      } catch (uploadErr) {
        console.error("VTON: S3 upload failed, returning base64:", uploadErr)
        // Fall back to data URI — frontend can still display it
      }
    }

    // Log cost for monitoring
    const usage = geminiResult?.usage
    if (usage?.cost) {
      console.log(`VTON: cost=$${usage.cost}, tokens=${usage.total_tokens}`)
    }

    return NextResponse.json({
      success: true,
      result: { image_url: imageData },
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
