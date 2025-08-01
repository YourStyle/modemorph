import { type NextRequest, NextResponse } from "next/server"

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

// Кэш для погоды (в памяти)
const weatherCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 10 * 60 * 1000 // 10 минут

export async function GET(request: NextRequest) {
  try {
    if (!OPENWEATHER_API_KEY) {
      return NextResponse.json({ error: "OpenWeather API key not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat") || "55.7558" // Moscow by default
    const lon = searchParams.get("lon") || "37.6176"

    const cacheKey = `${lat},${lon}`
    const cached = weatherCache.get(cacheKey)

    // Проверяем кэш
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    const url = `${OPENWEATHER_BASE_URL}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=ru`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`OpenWeather API error: ${response.status}`)
    }

    const data = await response.json()

    const weatherData = {
      location: data.name || "Неизвестно",
      temperature: Math.round(data.main.temp),
      description: data.weather[0].description,
      condition: data.weather[0].main.toLowerCase(),
      icon: getWeatherIcon(data.weather[0].main),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
    }

    // Сохраняем в кэш
    weatherCache.set(cacheKey, {
      data: weatherData,
      timestamp: Date.now(),
    })

    return NextResponse.json(weatherData)
  } catch (error) {
    console.error("Weather API error:", error)

    // Возвращаем fallback данные
    return NextResponse.json({
      location: "Москва",
      temperature: 20,
      description: "Ясно",
      condition: "clear",
      icon: "☀️",
      humidity: 50,
      windSpeed: 3,
      error: "Weather service temporarily unavailable",
    })
  }
}

function getWeatherIcon(condition: string): string {
  switch (condition.toLowerCase()) {
    case "clear":
      return "☀️"
    case "clouds":
      return "☁️"
    case "rain":
      return "🌧️"
    case "drizzle":
      return "🌦️"
    case "thunderstorm":
      return "⛈️"
    case "snow":
      return "❄️"
    case "mist":
    case "fog":
      return "🌫️"
    default:
      return "☀️"
  }
}
