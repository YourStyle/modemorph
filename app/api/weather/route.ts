import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

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
  console.log("Fetching weather from OpenWeather API:", url.replace(API_KEY, "***"))

  const response = await fetch(url)

  if (!response.ok) {
    const errorText = await response.text()
    console.error("OpenWeather API error:", response.status, errorText)
    throw new Error(`Weather API error: ${response.status}`)
  }

  const data = await response.json()
  console.log("OpenWeather API response:", data)

  return {
    temperature: Math.round(data.main.temp),
    condition: data.weather[0].main,
    description: data.weather[0].description,
    humidity: data.main.humidity,
    wind_speed: Math.round(data.wind.speed),
  }
}

async function getCityName(lat: number, lon: number): Promise<string> {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY
    if (!API_KEY) return "Unknown"

    const geoResponse = await fetch(
      `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`,
    )

    if (geoResponse.ok) {
      const geoData = await geoResponse.json()
      return geoData[0]?.local_names?.ru || geoData[0]?.name || "Unknown"
    }

    return "Unknown"
  } catch (error) {
    console.error("Error getting city name:", error)
    return "Unknown"
  }
}

async function saveWeatherToCache(
  supabase: any,
  weatherData: WeatherData,
  latitude: number,
  longitude: number,
  cityName: string,
  userId: string,
) {
  try {
    console.log("Saving weather to cache for user:", userId)

    // Проверяем, есть ли уже запись для этого пользователя
    const { data: existingData } = await supabase.from("weather_cache").select("id").eq("user_id", userId).limit(1)

    const weatherEntry = {
      city_name: cityName,
      temperature: weatherData.temperature,
      condition: weatherData.condition,
      description: weatherData.description,
      humidity: weatherData.humidity,
      wind_speed: weatherData.wind_speed,
      latitude,
      longitude,
      updated_at: new Date().toISOString(),
      user_id: userId,
    }

    if (existingData && existingData.length > 0) {
      // Обновляем существующую запись
      const { error } = await supabase.from("weather_cache").update(weatherEntry).eq("id", existingData[0].id)

      if (error) {
        console.error("Error updating weather cache:", error)
      } else {
        console.log("Weather cache updated successfully")
      }
    } else {
      // Создаем новую запись
      const { error } = await supabase.from("weather_cache").insert([weatherEntry])

      if (error) {
        console.error("Error saving weather cache:", error)
      } else {
        console.log("Weather cache saved successfully")
      }
    }
  } catch (error) {
    console.error("Error in saveWeatherToCache:", error)
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log("Weather API called")
    const user = await getAuthUser(req)

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    if (!user) {
      console.error("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    const { searchParams } = new URL(req.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    console.log("Received coordinates:", { lat, lon })

    if (!lat || !lon) {
      console.error("Missing coordinates")
      return NextResponse.json({ error: "Coordinates required" }, { status: 400 })
    }

    const latitude = Number.parseFloat(lat)
    const longitude = Number.parseFloat(lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      console.error("Invalid coordinates:", { latitude, longitude })
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
    }

    console.log(`Fetching weather for user ${user.id} at coordinates: ${latitude}, ${longitude}`)

    // Fetch weather data
    const weatherData = await fetchWeatherData(latitude, longitude)
    console.log("Weather data fetched:", weatherData)

    // Get city name
    const cityName = await getCityName(latitude, longitude)
    console.log("City name:", cityName)

    // Save to cache
    await saveWeatherToCache(supabase, weatherData, latitude, longitude, cityName, user.id)

    // Return weather data with icon and location
    const response = {
      temperature: weatherData.temperature,
      condition: weatherData.condition,
      description: weatherData.description,
      humidity: weatherData.humidity,
      wind_speed: weatherData.wind_speed,
      icon: getWeatherIcon(weatherData.condition),
      location: cityName,
    }

    console.log("Returning weather response:", response)
    return NextResponse.json(response)
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
