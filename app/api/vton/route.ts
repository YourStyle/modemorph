import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import {
  openrouterChat,
  imageUrlToBase64,
  uploadBase64ToS3,
} from "@/lib/openrouter"

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

    const result = await openrouterChat({
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
      image_config: { aspect_ratio: "3:4" },
    })

    const images = result.choices?.[0]?.message?.images
    if (!images || images.length === 0) {
      console.error("VTON: Gemini returned no images")
      return NextResponse.json(
        { error: "Модель не вернула изображение. Попробуйте ещё раз." },
        { status: 502 },
      )
    }

    // Upload to S3 for a persistent URL
    let imageData = images[0].image_url.url
    if (imageData.startsWith("data:image/")) {
      try {
        imageData = await uploadBase64ToS3(imageData, "vton")
        console.log("VTON: uploaded result to S3:", imageData)
      } catch (uploadErr) {
        console.error("VTON: S3 upload failed, returning base64:", uploadErr)
      }
    }

    if (result.usage?.cost) {
      console.log(`VTON: cost=$${result.usage.cost}, tokens=${result.usage.total_tokens}`)
    }

    return NextResponse.json({
      success: true,
      result: { image_url: imageData },
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    const status = message.includes("OPENROUTER_API_KEY") ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
