import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    console.log("[Recommendations API] Loading recommendations for user:", user.id)

    // Получаем рекомендации из таблицы main_recommendations
    const { data: recommendations, error } = await supabase
      .from("main_recommendations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Recommendations API] Database error:", error)
      return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 })
    }

    console.log("[Recommendations API] Found recommendations:", recommendations?.length || 0)

    // Если нет рекомендаций, возвращаем пустой массив
    if (!recommendations || recommendations.length === 0) {
      return NextResponse.json([])
    }

    // Парсим JSON из поля recommendations_data
    const parsedRecommendations = recommendations.map(rec => {
      try {
        return JSON.parse(rec.recommendations_data)
      } catch (parseError) {
        console.error("[Recommendations API] Parse error for recommendation:", rec.id, parseError)
        return null
      }
    }).filter(Boolean) // Убираем null значения

    // Возвращаем самые свежие рекомендации (первые в отсортированном списке)
    if (parsedRecommendations.length > 0) {
      const latestRecommendations = parsedRecommendations[0]

      // Проверяем что это массив разделов рекомендаций
      if (Array.isArray(latestRecommendations)) {
        console.log("[Recommendations API] Returning latest recommendations with sections:", latestRecommendations.length)
        return NextResponse.json(latestRecommendations)
      } else {
        console.log("[Recommendations API] Invalid recommendations format")
        return NextResponse.json([])
      }
    }

    return NextResponse.json([])
  } catch (error) {
    console.error("[Recommendations API] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { recommendations } = await req.json()

    if (!recommendations) {
      return NextResponse.json({ error: "Recommendations data required" }, { status: 400 })
    }

    console.log("[Recommendations API] Saving recommendations for user:", user.id)

    // Сохраняем рекомендации в таблицу main_recommendations
    const { data, error } = await supabase
      .from("main_recommendations")
      .insert({
        user_id: user.id,
        recommendations_data: JSON.stringify(recommendations),
        created_at: new Date().toISOString()
      })
      .select()

    if (error) {
      console.error("[Recommendations API] Save error:", error)
      return NextResponse.json({ error: "Failed to save recommendations" }, { status: 500 })
    }

    console.log("[Recommendations API] Successfully saved recommendations")
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[Recommendations API] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}