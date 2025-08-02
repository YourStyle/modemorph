import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY

function getWeatherIcon(condition: string): string {
  const conditionLower = condition.toLowerCase()

  if (conditionLower.includes("clear") || conditionLower.includes("sunny")) {
    return "☀️"
  } else if (conditionLower.includes("cloud")) {
    return "☁️"
  } else if (conditionLower.includes("rain") || conditionLower.includes("drizzle")) {
    return "🌧️"
  } else if (conditionLower.includes("snow")) {
    return "❄️"
  } else if (conditionLower.includes("thunder") || conditionLower.includes("storm")) {
    return "⛈️"
  } else if (conditionLower.includes("mist") || conditionLower.includes("fog")) {
    return "🌫️"
  } else if (conditionLower.includes("wind")) {
    return "💨"
  }

  return "🌤️" // Default icon
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    if (!lat || !lon) {
      return NextResponse.json({ error: "Coordinates are required" }, { status: 400 })
    }

    if (!OPENWEATHER_API_KEY) {
      console.error("OpenWeather API key not configured")
      return NextResponse.json({ error: "Weather service not configured" }, { status: 500 })
    }

    // Get weather from OpenWeather API
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=ru`

    console.log("Fetching weather from:", weatherUrl.replace(OPENWEATHER_API_KEY, "API_KEY"))

    const weatherResponse = await fetch(weatherUrl)

    if (!weatherResponse.ok) {
      console.error("OpenWeather API error:", weatherResponse.status, weatherResponse.statusText)
      throw new Error(`Weather API error: ${weatherResponse.status}`)
    }

    const weatherData = await weatherResponse.json()
    console.log("Weather data received:", weatherData)

    const weather = {
      city_name: weatherData.name || "Unknown",
      latitude: Number.parseFloat(lat),
      longitude: Number.parseFloat(lon),
      temperature: Math.round(weatherData.main.temp),
      condition: weatherData.weather[0].main,
      description: weatherData.weather[0].description,
      humidity: weatherData.main.humidity,
      wind_speed: Math.round(weatherData.wind.speed),
    }

    // Save to cache with user_id
    try {
      const { error: insertError } = await supabase.from("weather_cache").upsert(
        {
          user_id: user.id,
          city_name: weather.city_name,
          latitude: weather.latitude,
          longitude: weather.longitude,
          temperature: weather.temperature,
          condition: weather.condition,
          description: weather.description,
          humidity: weather.humidity,
          wind_speed: weather.wind_speed,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,city_name",
        },
      )

      if (insertError) {
        console.error("Error saving weather to cache:", insertError)
      } else {
        console.log("Weather saved to cache successfully")
      }
    } catch (cacheError) {
      console.error("Cache error:", cacheError)
      // Continue even if cache fails
    }

    // Add weather icon
    const weatherWithIcon = {
      ...weather,
      icon: getWeatherIcon(weather.condition),
    }

    return NextResponse.json(weatherWithIcon)
  } catch (error) {
    console.error("Weather API error:", error)

    // Return fallback weather only on error
    const fallbackWeather = {
      city_name: "Москва",
      temperature: 20,
      condition: "Clear",
      description: "ясно",
      humidity: 50,
      wind_speed: 5,
      icon: "☀️",
    }

    return NextResponse.json(fallbackWeather)
  }
}
