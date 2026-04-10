import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import { openrouterChat } from "@/lib/openrouter"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// System prompt for the fashion AI assistant
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a fashion stylist AI assistant for the ModeMorph app. You help users with outfit recommendations, style advice, and wardrobe management.

RULES:
1. If the user's message is NOT about fashion, clothing, style, or wardrobe — respond with: [{"type": "trash"}]
2. If the user asks a general fashion question — respond with: [{"content": "your answer in Russian"}]
3. If the user asks for an outfit recommendation — respond with an outfit suggestion using items from their wardrobe.

For outfit recommendations, you will receive the user's wardrobe items. Build outfits ONLY from those items.

Response format for outfit recommendations:
[{
  "id": "unique_id",
  "title": "Outfit title in Russian",
  "description": "Brief description in Russian",
  "items": [
    {"id": "item_id", "name": "item_name", "user_id": "user_id", "image_url": "url", "color": "color", "shade": null, "has_print": "no", "notes": null, "url": null}
  ],
  "suggested_items_count": number_of_items
}]

IMPORTANT: Always respond with a JSON array. Never add text outside the JSON. Use Russian for all text content.`

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, weather } = body

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Fetch user's wardrobe items for context
    const { data: wardrobeItems } = await supabase
      .from("wardrobe_user_items")
      .select("id, item_name, color, shade, style, material, clothing_type, has_print, image_url, user_id")
      .eq("user_id", user.id)
      .limit(50)

    const wardrobeContext = wardrobeItems && wardrobeItems.length > 0
      ? `\n\nUser's wardrobe (${wardrobeItems.length} items):\n${JSON.stringify(wardrobeItems.map(i => ({
          id: i.id,
          name: i.item_name,
          color: i.color,
          shade: i.shade,
          style: i.style,
          material: i.material,
          type: i.clothing_type,
          has_print: i.has_print,
          image_url: i.image_url,
          user_id: i.user_id,
        })))}`
      : "\n\nUser has no items in their wardrobe yet."

    const weatherContext = weather
      ? `\nCurrent weather: ${weather.location}, ${weather.temperature}°C, ${weather.description}`
      : ""

    const userMessage = `${prompt}${weatherContext}${wardrobeContext}`

    const result = await openrouterChat({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
    })

    const content = result.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        [{ content: "Извините, не удалось обработать запрос. Попробуйте ещё раз." }],
      )
    }

    // Parse JSON response
    try {
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      return NextResponse.json(Array.isArray(parsed) ? parsed : [parsed])
    } catch {
      // If model returned plain text, wrap it
      return NextResponse.json([{ content }])
    }
  } catch (error) {
    console.error("[ai-assistant] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    if (message.includes("OPENROUTER_API_KEY")) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
