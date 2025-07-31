import { type NextRequest, NextResponse } from "next/server"

// Кэш в памяти для погодных данных
const weatherCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 10 * 60 * 1000 // 10 минут

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
      console.error("OpenWeather API key not configured")
      return NextResponse.json({ error: "Weather service not configured" }, { status: 503 })
    }

    // Используем координаты Москвы по умолчанию
    const latitude = lat || "55.7558"
    const longitude = lon || "37.6176"

    const cacheKey = `${latitude},${longitude}`

    // Проверяем кэш
    const cached = weatherCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    // Запрос к OpenWeather API
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=ru`

    const response = await fetch(weatherUrl, {
      headers: {
        "User-Agent": "ModeMorph/1.0",
      },
    })

    if (!response.ok) {
      console.error(`OpenWeather API error: ${response.status} ${response.statusText}`)
      throw new Error(`Weather API returned ${response.status}`)
    }

    const data = await response.json()

    // Обрабатываем данные
    const weatherData = {
      temperature: Math.round(data.main.temp),
      condition: data.weather[0].main.toLowerCase(),
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: data.wind?.speed || 0,
      city: data.name,
      location: data.name,
      icon: data.weather[0].icon,
    }

    // Сохраняем в кэш
    weatherCache.set(cacheKey, {
      data: weatherData,
      timestamp: Date.now(),
    })

    return NextResponse.json(weatherData)
  } catch (error) {
    console.error("Weather fetch error:", error)

    // Возвращаем данные по умолчанию для Москвы
    const fallbackData = {
      temperature: 20,
      condition: "clear",
      description: "ясно",
      humidity: 50,
      windSpeed: 3,
      city: "Москва",
      location: "Москва",
      icon: "01d",
    }

    return NextResponse.json(fallbackData)
  }
}
