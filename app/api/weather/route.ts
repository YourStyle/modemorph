import { type NextRequest, NextResponse } from "next/server"
import { WeatherCache } from "@/lib/weather-cache"
import { createClient } from "@/lib/supabase/server"

interface WeatherAPIResponse {
  location: {
    name: string
    region: string
    country: string
  }
  current: {
    temp_c: number
    condition: {
      text: string
      code: number
    }
    humidity: number
    wind_kph: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { latitude, longitude } = await request.json()

    if (!latitude || !longitude) {
      return NextResponse.json({ error: "Latitude and longitude are required" }, { status: 400 })
    }

    const weatherCache = new WeatherCache()

    // Сначала проверяем кэш
    const cachedWeather = await weatherCache.getCachedWeather(latitude, longitude)
    if (cachedWeather) {
      console.log("Returning cached weather data")
      return NextResponse.json(cachedWeather)
    }

    // Если кэша нет, запрашиваем у OpenWeatherMap
    const apiKey = process.env.OPENWEATHER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Weather API key not configured" }, { status: 500 })
    }

    const weatherUrl = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${latitude},${longitude}&aqi=no`

    const response = await fetch(weatherUrl)
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`)
    }

    const data: WeatherAPIResponse = await response.json()

    const weatherData = {
      temperature: Math.round(data.current.temp_c),
      condition: data.current.condition.text.toLowerCase(),
      description: data.current.condition.text,
      location: `${data.location.name}, ${data.location.region}`,
      humidity: data.current.humidity,
      windSpeed: Math.round(data.current.wind_kph),
    }

    // Сохраняем в кэш с user_id
    await weatherCache.saveWeatherData(weatherData, latitude, longitude, user.id)

    console.log("Returning fresh weather data")
    return NextResponse.json(weatherData)
  } catch (error) {
    console.error("Error fetching weather:", error)
    return NextResponse.json({ error: "Failed to fetch weather data" }, { status: 500 })
  }
}
