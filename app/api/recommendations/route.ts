import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    // Получаем токен из Authorization header для создания authenticated клиента
    const authHeader = req.headers.get("authorization")
    const token = authHeader?.replace("Bearer ", "")

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Создаем клиент с токеном пользователя для соблюдения RLS политик
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    })

    // Проверяем пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    console.log("[Recommendations API] Loading recommendations for user:", user.id)

    // Для отладки: проверим данные через service role
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const serviceSupabase = createClient(supabaseUrl, serviceKey)
    const { data: allUserRecs, error: serviceError } = await serviceSupabase
      .from("main_recommendations")
      .select("id, user_id, created_at")
      .eq("user_id", user.id)

    console.log("[Recommendations API] Service role check:", {
      totalUserRecords: allUserRecs?.length || 0,
      serviceError: serviceError?.message,
      sampleRecords: allUserRecs?.slice(0, 3)
    })

    // Получаем рекомендации из таблицы main_recommendations с RLS
    const { data: recommendations, error } = await supabase
      .from("main_recommendations")
      .select("*")
      .order("created_at", { ascending: false })

    console.log("[Recommendations API] Query result:", {
      error: error?.message,
      recommendationsCount: recommendations?.length || 0,
      userFromToken: user.id
    })

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
    // Используем service role для записи (обходим RLS для записи)
    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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