import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface WeatherData {
  temperature: number
  condition: string
  description: string
  humidity: number
  wind_speed: number
}

function getWeatherIcon(condition: string): string {
  const conditionLower = condition.toLowerCase()

  if (conditionLower.includes("clear") || conditionLower.includes("sunny")) {
    return "☀️"
  } else if (conditionLower.includes("cloud")) {
    return "☁️"
  } else if (conditionLower.includes("rain") || conditionLower.includes("drizzle")) {
    return "🌧️"
  } else if (conditionLower.includes("snow")) {
    return "❄️"
  } else if (conditionLower.includes("thunder") || conditionLower.includes("storm")) {
    return "⛈️"
  } else if (conditionLower.includes("fog") || conditionLower.includes("mist")) {
    return "🌫️"
  } else if (conditionLower.includes("wind")) {
    return "💨"
  }

  return "🌤️" // Default
}

async function fetchWeatherData(lat: number, lon: number): Promise<WeatherData> {
  const API_KEY = process.env.OPENWEATHER_API_KEY

  if (!API_KEY) {
    throw new Error("OpenWeather API key not configured")
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ru`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`)
  }

  const data = await response.json()

  return {
    temperature: Math.round(data.main.temp),
    condition: data.weather[0].main,
    description: data.weather[0].description,
    humidity: data.main.humidity,
    wind_speed: Math.round(data.wind.speed),
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    if (!lat || !lon) {
      return NextResponse.json({ error: "Coordinates required" }, { status: 400 })
    }

    const latitude = Number.parseFloat(lat)
    const longitude = Number.parseFloat(lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
    }

    console.log(`Fetching weather for user ${user.id} at coordinates: ${latitude}, ${longitude}`)

    // Fetch weather data
    const weatherData = await fetchWeatherData(latitude, longitude)

    // Get city name from reverse geocoding
    let cityName = "Unknown"
    try {
      const geoResponse = await fetch(
        `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${process.env.OPENWEATHER_API_KEY}`,
      )
      if (geoResponse.ok) {
        const geoData = await geoResponse.json()
        cityName = geoData[0]?.local_names?.ru || geoData[0]?.name || "Unknown"
      }
    } catch (error) {
      console.error("Error getting city name:", error)
    }

    // Return weather data with icon and location
    return NextResponse.json({
      temperature: weatherData.temperature,
      condition: weatherData.condition,
      description: weatherData.description,
      humidity: weatherData.humidity,
      wind_speed: weatherData.wind_speed,
      icon: getWeatherIcon(weatherData.condition),
      location: cityName,
    })
  } catch (error) {
    console.error("Weather API error:", error)

    // Return fallback weather only on error
    return NextResponse.json({
      temperature: 20,
      condition: "Clear",
      description: "ясно",
      humidity: 50,
      wind_speed: 5,
      icon: "☀️",
      location: "Москва",
    })
  }
}
