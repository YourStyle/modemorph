import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createClient()

    // Получаем первые 10 вещей из гардероба
    const { data: items, error } = await supabase.from("wardrobe_items").select("id, item_name, image_url").limit(10)

    if (error) {
      throw error
    }

    console.log("👔 Found wardrobe items:", items?.length)

    // Для каждой вещи пытаемся найти изображение
    const results = []
    for (const item of items || []) {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/images/match`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ itemName: item.item_name }),
          },
        )

        const matchResult = await response.json()

        results.push({
          id: item.id,
          item_name: item.item_name,
          database_image_url: item.image_url,
          found_image_url: matchResult.imageUrl,
          match_found: !!matchResult.imageUrl,
          debug: matchResult.debug,
        })
      } catch (err) {
        results.push({
          id: item.id,
          item_name: item.item_name,
          database_image_url: item.image_url,
          error: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      success: true,
      total_items: items?.length || 0,
      results,
    })
  } catch (error) {
    console.error("❌ Error in wardrobe images debug:", error)
    return NextResponse.json(
      {
        error: "Failed to debug wardrobe images",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
