import { createClient } from "@supabase/supabase-js"

export interface WeatherData {
  temperature: number
  condition: string
  description: string
  location: string
  humidity: number
  windSpeed: number
}

export interface WeatherCacheEntry {
  id: string
  city_name: string
  temperature: number
  condition: string
  description: string
  humidity: number
  wind_speed: number
  latitude: number
  longitude: number
  updated_at: string
  user_id?: string
}

export class WeatherCache {
  private supabase

  constructor() {
    // Используем service role для операций с кэшем погоды
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    this.supabase = createClient(supabaseUrl, serviceKey)
  }

  async getCachedWeather(latitude: number, longitude: number): Promise<WeatherData | null> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

      // Ищем кэшированную погоду в радиусе ~11км (0.1 градуса)
      const { data, error } = await this.supabase
        .from("weather_cache")
        .select("*")
        .gte("updated_at", oneHourAgo)
        .gte("latitude", latitude - 0.05)
        .lte("latitude", latitude + 0.05)
        .gte("longitude", longitude - 0.05)
        .lte("longitude", longitude + 0.05)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (error) {
        console.error("Error fetching cached weather:", error)
        return null
      }

      if (data && data.length > 0) {
        const cached = data[0] as WeatherCacheEntry
        return {
          temperature: cached.temperature,
          condition: cached.condition,
          description: cached.description,
          location: cached.city_name,
          humidity: cached.humidity,
          windSpeed: cached.wind_speed,
        }
      }

      return null
    } catch (error) {
      console.error("Error in getCachedWeather:", error)
      return null
    }
  }

  async saveWeatherData(weatherData: WeatherData, latitude: number, longitude: number, userId?: string): Promise<void> {
    try {
      // Проверяем, есть ли уже запись для этих координат (в радиусе ~5км)
      const { data: existingData } = await this.supabase
        .from("weather_cache")
        .select("id")
        .gte("latitude", latitude - 0.025)
        .lte("latitude", latitude + 0.025)
        .gte("longitude", longitude - 0.025)
        .lte("longitude", longitude + 0.025)
        .limit(1)

      const weatherEntry = {
        city_name: weatherData.location,
        temperature: weatherData.temperature,
        condition: weatherData.condition,
        description: weatherData.description,
        humidity: weatherData.humidity,
        wind_speed: weatherData.windSpeed,
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
        user_id: userId,
      }

      if (existingData && existingData.length > 0) {
        // Обновляем существующую запись
        const { error } = await this.supabase.from("weather_cache").update(weatherEntry).eq("id", existingData[0].id)

        if (error) {
          console.error("Error updating weather cache:", error)
        }
      } else {
        // Создаем новую запись
        const { error } = await this.supabase.from("weather_cache").insert([weatherEntry])

        if (error) {
          console.error("Error saving weather cache:", error)
        }
      }
    } catch (error) {
      console.error("Error in saveWeatherData:", error)
    }
  }

  async getCachedWeatherForUser(userId: string): Promise<WeatherData | null> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

      // Ищем последнюю кэшированную погоду для пользователя или в его районе
      const { data, error } = await this.supabase
        .from("weather_cache")
        .select("*")
        .gte("updated_at", oneHourAgo)
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (error) {
        console.error("Error fetching cached weather for user:", error)
        return null
      }

      if (data && data.length > 0) {
        const cached = data[0] as WeatherCacheEntry
        return {
          temperature: cached.temperature,
          condition: cached.condition,
          description: cached.description,
          location: cached.city_name,
          humidity: cached.humidity,
          windSpeed: cached.wind_speed,
        }
      }

      return null
    } catch (error) {
      console.error("Error in getCachedWeatherForUser:", error)
      return null
    }
  }
}
