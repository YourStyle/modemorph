import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { WeatherCache } from "@/lib/weather-cache"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Проверяем авторизацию пользователя
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем WeatherCache для получения кэшированной погоды
    const weatherCache = new WeatherCache()
    const cachedWeather = await weatherCache.getCachedWeatherForUser(user.id)

    if (cachedWeather) {
      return NextResponse.json(cachedWeather)
    }

    // Если кэша нет, возвращаем 404
    return NextResponse.json({ error: "No cached weather found" }, { status: 404 })
  } catch (error) {
    console.error("Error getting cached weather:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
