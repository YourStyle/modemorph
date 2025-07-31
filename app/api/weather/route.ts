import { type NextRequest, NextResponse } from "next/server"
import { WeatherCache } from "@/lib/weather-cache"

interface WeatherResponse {
  temperature: number
  condition: string
  description: string
  location: string
  humidity: number
  windSpeed: number
}

interface GeolocationCoords {
  latitude: number
  longitude: number
}

async function fetchWeatherWithRetry(
  latitude: number,
  longitude: number,
  apiKey: string,
  maxRetries = 3,
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Weather API attempt ${attempt}/${maxRetries}`)

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=ru`,
        {
          next: { revalidate: 0 },
          headers: {
            "User-Agent": "ModeMorph/1.0",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`Weather API returned ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log("Weather API success:", data.name, data.main.temp + "°C")
      return data
    } catch (error) {
      console.error(`Weather API attempt ${attempt} failed:`, error)

      if (attempt === maxRetries) {
        throw error
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude }: GeolocationCoords = await request.json()

    if (!latitude || !longitude) {
      throw new Error("Invalid coordinates provided")
    }

    const weatherCache = new WeatherCache()

    // First, try to get cached weather data by location
    let weatherData = await weatherCache.getCachedWeatherByLocation({ latitude, longitude })

    if (weatherData) {
      console.log("Using cached weather data for:", weatherData.location)
      return NextResponse.json(weatherData)
    }

    // If no cached data by location, fetch from API
    const API_KEY = process.env.OPENWEATHER_API_KEY
    if (!API_KEY) {
      throw new Error("Weather API key not configured")
    }

    console.log("Fetching fresh weather data from API for coordinates:", latitude, longitude)

    const data = await fetchWeatherWithRetry(latitude, longitude, API_KEY)

    // Map OpenWeatherMap conditions to our conditions
    const getCondition = (weatherCode: string): string => {
      const code = weatherCode.toLowerCase()
      if (code.includes("clear")) return "sunny"
      if (code.includes("cloud")) return "cloudy"
      if (code.includes("rain") || code.includes("drizzle")) return "rainy"
      if (code.includes("snow")) return "snowy"
      return "cloudy"
    }

    weatherData = {
      temperature: Math.round(data.main.temp),
      condition: getCondition(data.weather[0].main),
      description: data.weather[0].description,
      location: data.name,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind?.speed || 0),
    }

    // Save to cache for future requests
    await weatherCache.saveWeatherData({ latitude, longitude }, weatherData)

    // Clean up old data (run occasionally)
    if (Math.random() < 0.1) {
      // 10% chance to run cleanup
      weatherCache.cleanupOldWeatherData().catch(console.error)
    }

    return NextResponse.json(weatherData)
  } catch (error) {
    console.error("Failed to load weather after all retries:", error)

    // Try to get any cached data as fallback (even if older than 1 hour)
    try {
      const weatherCache = new WeatherCache()
      const fallbackWeather = await weatherCache.getCachedWeather("Москва")

      if (fallbackWeather) {
        console.log("Using cached Moscow weather as fallback")
        return NextResponse.json(fallbackWeather)
      }
    } catch (fallbackError) {
      console.error("Fallback cache lookup failed:", fallbackError)
    }

    // Return error response instead of hardcoded data
    return NextResponse.json({ error: "Weather service temporarily unavailable" }, { status: 503 })
  }
}
