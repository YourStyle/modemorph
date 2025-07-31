import { type NextRequest, NextResponse } from "next/server"

// Кэш для погодных данных
const weatherCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 10 * 60 * 1000 // 10 минут

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    // Используем координаты Москвы по умолчанию
    const latitude = lat || "55.7558"
    const longitude = lon || "37.6176"

    const cacheKey = `${latitude},${longitude}`

    // Проверяем кэш
    const cached = weatherCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
      console.error("OpenWeather API key not found")
      return NextResponse.json(
        {
          error: "Weather service unavailable",
          location: "Москва",
          temperature: 20,
          description: "Ясно",
          icon: "01d",
        },
        { status: 200 },
      )
    }

    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=ru`

    const response = await fetch(weatherUrl, {
      headers: {
        "User-Agent": "ModeMorph/1.0",
      },
    })

    if (!response.ok) {
      throw new Error(`OpenWeather API error: ${response.status}`)
    }

    const data = await response.json()

    const weatherData = {
      location: data.name || "Москва",
      temperature: Math.round(data.main?.temp || 20),
      description: data.weather?.[0]?.description || "Ясно",
      icon: data.weather?.[0]?.icon || "01d",
      humidity: data.main?.humidity || 50,
      windSpeed: data.wind?.speed || 0,
      pressure: data.main?.pressure || 1013,
    }

    // Сохраняем в кэш
    weatherCache.set(cacheKey, {
      data: weatherData,
      timestamp: Date.now(),
    })

    return NextResponse.json(weatherData)
  } catch (error) {
    console.error("Weather fetch error:", error)

    // Возвращаем fallback данные
    return NextResponse.json({
      location: "Москва",
      temperature: 20,
      description: "Ясно",
      icon: "01d",
      humidity: 50,
      windSpeed: 0,
      pressure: 1013,
    })
  }
}
