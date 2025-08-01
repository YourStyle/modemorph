import { type NextRequest, NextResponse } from "next/server"

// Кэш в памяти для погодных данных
const weatherCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION = 10 * 60 * 1000 // 10 минут

// Маппинг иконок OpenWeatherMap на эмодзи
const weatherIcons: Record<string, string> = {
  "01d": "☀️", // clear sky day
  "01n": "🌙", // clear sky night
  "02d": "⛅", // few clouds day
  "02n": "☁️", // few clouds night
  "03d": "☁️", // scattered clouds
  "03n": "☁️", // scattered clouds
  "04d": "☁️", // broken clouds
  "04n": "☁️", // broken clouds
  "09d": "🌧️", // shower rain
  "09n": "🌧️", // shower rain
  "10d": "🌦️", // rain day
  "10n": "🌧️", // rain night
  "11d": "⛈️", // thunderstorm
  "11n": "⛈️", // thunderstorm
  "13d": "❄️", // snow
  "13n": "❄️", // snow
  "50d": "🌫️", // mist
  "50n": "🌫️", // mist
}

// Маппинг описаний на русский
const weatherDescriptions: Record<string, string> = {
  "clear sky": "ясно",
  "few clouds": "малооблачно",
  "scattered clouds": "переменная облачность",
  "broken clouds": "облачно",
  "shower rain": "ливень",
  rain: "дождь",
  thunderstorm: "гроза",
  snow: "снег",
  mist: "туман",
  "overcast clouds": "пасмурно",
  "light rain": "небольшой дождь",
  "moderate rain": "умеренный дождь",
  "heavy intensity rain": "сильный дождь",
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
      console.error("OpenWeather API key not found")
      return NextResponse.json(
        {
          error: "Weather service configuration error",
          temperature: 20,
          description: "ясно",
          location: "Москва",
          icon: "☀️",
        },
        { status: 200 },
      )
    }

    // Используем Москву по умолчанию, если координаты не предоставлены
    const latitude = lat || "55.7558"
    const longitude = lon || "37.6176"

    // Проверяем кэш
    const cacheKey = `${latitude},${longitude}`
    const cached = weatherCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    // Запрос к OpenWeatherMap API
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=ru`

    console.log("Fetching weather from:", weatherUrl.replace(apiKey, "***"))

    const response = await fetch(weatherUrl, {
      headers: {
        "User-Agent": "ModeMorph/1.0",
      },
    })

    if (!response.ok) {
      console.error("OpenWeather API error:", response.status, response.statusText)
      throw new Error(`Weather API returned ${response.status}`)
    }

    const data = await response.json()

    // Обрабатываем данные
    const weatherData = {
      temperature: Math.round(data.main.temp),
      description: weatherDescriptions[data.weather[0].description] || data.weather[0].description,
      location: data.name || "Москва",
      icon: weatherIcons[data.weather[0].icon] || "☀️",
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      pressure: data.main.pressure,
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
    return NextResponse.json(
      {
        temperature: 20,
        description: "ясно",
        location: "Москва",
        icon: "☀️",
        humidity: 50,
        windSpeed: 2,
        pressure: 1013,
      },
      { status: 200 },
    )
  }
}
