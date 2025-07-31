import { type NextRequest, NextResponse } from "next/server"

// Кэш для погодных данных
const weatherCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 10 * 60 * 1000 // 10 минут

// Маппинг OpenWeather иконок на эмодзи
const weatherIcons: Record<string, string> = {
  "01d": "☀️", // clear sky day
  "01n": "🌙", // clear sky night
  "02d": "⛅", // few clouds day
  "02n": "☁️", // few clouds night
  "03d": "☁️", // scattered clouds
  "03n": "☁️",
  "04d": "☁️", // broken clouds
  "04n": "☁️",
  "09d": "🌧️", // shower rain
  "09n": "🌧️",
  "10d": "🌦️", // rain day
  "10n": "🌧️", // rain night
  "11d": "⛈️", // thunderstorm
  "11n": "⛈️",
  "13d": "❄️", // snow
  "13n": "❄️",
  "50d": "🌫️", // mist
  "50n": "🌫️",
}

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
          error: "Weather service configuration error",
          fallback: {
            temperature: 20,
            description: "Ясно",
            location: "Москва",
            icon: "☀️",
          },
        },
        { status: 500 },
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
      temperature: Math.round(data.main.temp),
      description: data.weather[0].description,
      location: data.name || "Москва",
      icon: weatherIcons[data.weather[0].icon] || "☀️",
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
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
      temperature: 20,
      description: "Ясно",
      location: "Москва",
      icon: "☀️",
      error: "Weather service unavailable",
    })
  }
}
