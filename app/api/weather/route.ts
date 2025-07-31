import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface WeatherData {
  temperature: number
  description: string
  icon: string
  location: string
}

interface CachedWeather {
  id: string
  location: string
  temperature: number
  description: string
  icon: string
  cached_at: string
}

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

async function fetchWeatherWithRetry(lat: number, lon: number, retries = 3): Promise<WeatherData | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=ru`,
        {
          next: { revalidate: 600 }, // Cache for 10 minutes
          headers: {
            "User-Agent": "ModeMorph-Weather-App/1.0",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`)
      }

      const data = await response.json()

      return {
        temperature: Math.round(data.main.temp),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        location: data.name || "Unknown",
      }
    } catch (error) {
      console.error(`Weather fetch attempt ${i + 1} failed:`, error)

      if (i === retries - 1) {
        return null
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    if (!lat || !lon) {
      return NextResponse.json({ error: "Latitude and longitude are required" }, { status: 400 })
    }

    if (!OPENWEATHER_API_KEY) {
      return NextResponse.json({ error: "Weather service not configured" }, { status: 503 })
    }

    const latitude = Number.parseFloat(lat)
    const longitude = Number.parseFloat(lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
    }

    const supabase = createClient()

    // Check cache first
    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`
    const { data: cachedWeather } = await supabase.from("weather_cache").select("*").eq("location", cacheKey).single()

    if (cachedWeather) {
      const cacheAge = Date.now() - new Date(cachedWeather.cached_at).getTime()

      if (cacheAge < CACHE_DURATION) {
        return NextResponse.json({
          temperature: cachedWeather.temperature,
          description: cachedWeather.description,
          icon: cachedWeather.icon,
          location: cachedWeather.location,
          fromCache: true,
        })
      }
    }

    // Fetch fresh weather data
    const weatherData = await fetchWeatherWithRetry(latitude, longitude)

    if (!weatherData) {
      return NextResponse.json({ error: "Weather data unavailable" }, { status: 503 })
    }

    // Update cache
    await supabase.from("weather_cache").upsert({
      location: cacheKey,
      temperature: weatherData.temperature,
      description: weatherData.description,
      icon: weatherData.icon,
      cached_at: new Date().toISOString(),
    })

    return NextResponse.json({
      ...weatherData,
      fromCache: false,
    })
  } catch (error) {
    console.error("Weather API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
