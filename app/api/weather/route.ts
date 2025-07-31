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

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude }: GeolocationCoords = await request.json()
    const weatherCache = new WeatherCache()

    // First, try to get cached weather data by location
    let weatherData = await weatherCache.getCachedWeatherByLocation({ latitude, longitude })

    if (weatherData) {
      console.log("Using cached weather data by location")
      return NextResponse.json(weatherData)
    }

    // If no cached data by location, fetch from API
    const API_KEY = process.env.OPENWEATHER_API_KEY
    if (!API_KEY) {
      throw new Error("Weather API key not configured")
    }

    console.log("Fetching fresh weather data from API")
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=ru`,
      {
        next: { revalidate: 0 }, // Don't cache at Next.js level, we handle caching in DB
      },
    )

    if (!response.ok) {
      throw new Error("Weather API request failed")
    }

    const data = await response.json()

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
    console.error("Failed to load weather:", error)

    // Try to get any cached data for Moscow as fallback
    const weatherCache = new WeatherCache()
    const fallbackWeather = await weatherCache.getCachedWeather("Москва")

    if (fallbackWeather) {
      console.log("Using cached Moscow weather as fallback")
      return NextResponse.json(fallbackWeather)
    }

    // Return hardcoded fallback weather data
    const hardcodedFallback: WeatherResponse = {
      temperature: 22,
      condition: "sunny",
      description: "Солнечно",
      location: "Москва",
      humidity: 60,
      windSpeed: 5,
    }

    return NextResponse.json(hardcodedFallback)
  }
}
