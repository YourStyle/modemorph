import { type NextRequest, NextResponse } from "next/server"

interface WeatherData {
  temperature: number
  description: string
  icon: string
  location: string
}

// Use server-side environment variable (without NEXT_PUBLIC prefix)
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

// In-memory cache for weather data
const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>()

async function fetchWeatherWithRetry(lat: number, lon: number, retries = 3): Promise<WeatherData | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=ru`,
        {
          headers: {
            "User-Agent": "ModeMorph-Weather-App/1.0",
          },
          // Don't cache on Vercel edge
          cache: "no-store",
        },
      )

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status} ${response.statusText}`)
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
      console.error("OpenWeather API key not configured")
      return NextResponse.json({ error: "Weather service not configured" }, { status: 503 })
    }

    const latitude = Number.parseFloat(lat)
    const longitude = Number.parseFloat(lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
    }

    // Check cache first
    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`
    const cached = weatherCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
      })
    }

    // Fetch fresh weather data
    const weatherData = await fetchWeatherWithRetry(latitude, longitude)

    if (!weatherData) {
      return NextResponse.json({ error: "Weather data unavailable" }, { status: 503 })
    }

    // Update cache
    weatherCache.set(cacheKey, {
      data: weatherData,
      timestamp: Date.now(),
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
