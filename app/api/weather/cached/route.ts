import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  try {
    console.log("Cached weather API called")

    const user = await getAuthUser(request)
    if (!user) {
      console.error("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    console.log("User authenticated for cached weather:", user.id)

    // Ищем кэшированную погоду для пользователя (не старше 1 часа)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    console.log("Looking for weather cache newer than:", oneHourAgo)

    const { data, error } = await supabase
      .from("weather_cache")
      .select("*")
      .eq("user_id", user.id)
      .gte("updated_at", oneHourAgo)
      .order("updated_at", { ascending: false })
      .limit(1)

    if (error) {
      console.error("Error fetching cached weather:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    console.log("Cached weather query result:", data)

    if (data && data.length > 0) {
      const cached = data[0]

      // Определяем иконку погоды
      const getWeatherIcon = (condition: string): string => {
        const conditionLower = condition.toLowerCase()
        if (conditionLower.includes("clear") || conditionLower.includes("sunny")) return "☀️"
        if (conditionLower.includes("cloud")) return "☁️"
        if (conditionLower.includes("rain") || conditionLower.includes("drizzle")) return "🌧️"
        if (conditionLower.includes("snow")) return "❄️"
        if (conditionLower.includes("thunder") || conditionLower.includes("storm")) return "⛈️"
        if (conditionLower.includes("fog") || conditionLower.includes("mist")) return "🌫️"
        if (conditionLower.includes("wind")) return "💨"
        return "🌤️"
      }

      const response = {
        temperature: cached.temperature,
        condition: cached.condition,
        description: cached.description,
        location: cached.city_name,
        humidity: cached.humidity,
        wind_speed: cached.wind_speed,
        icon: getWeatherIcon(cached.condition),
      }

      console.log("Returning cached weather:", response)
      return NextResponse.json(response)
    }

    console.log("No cached weather found")
    return NextResponse.json({ error: "No cached weather found" }, { status: 404 })
  } catch (error) {
    console.error("Error getting cached weather:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
