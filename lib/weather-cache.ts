import { createClient } from "@/lib/supabase/server"

interface WeatherData {
  temperature: number
  condition: string
  description: string
  location: string
  humidity: number
  windSpeed: number
}

interface WeatherCacheRow {
  id: number
  city_name: string
  latitude: number
  longitude: number
  temperature: number
  condition: string
  description: string
  humidity: number
  wind_speed: number
  created_at: string
  updated_at: string
}

interface GeolocationCoords {
  latitude: number
  longitude: number
}

export class WeatherCache {
  private supabase = createClient()

  // Check if we have fresh weather data (less than 1 hour old) for a city
  async getCachedWeather(cityName: string): Promise<WeatherData | null> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

      const { data, error } = await this.supabase
        .from("weather_cache")
        .select("*")
        .eq("city_name", cityName)
        .gte("updated_at", oneHourAgo)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        return null
      }

      return this.mapRowToWeatherData(data)
    } catch (error) {
      console.error("Error getting cached weather:", error)
      return null
    }
  }

  // Check if we have fresh weather data for specific coordinates (within 0.1 degree radius)
  async getCachedWeatherByLocation(coords: GeolocationCoords): Promise<WeatherData | null> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const tolerance = 0.1 // ~11km radius

      const { data, error } = await this.supabase
        .from("weather_cache")
        .select("*")
        .gte("latitude", coords.latitude - tolerance)
        .lte("latitude", coords.latitude + tolerance)
        .gte("longitude", coords.longitude - tolerance)
        .lte("longitude", coords.longitude + tolerance)
        .gte("updated_at", oneHourAgo)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        return null
      }

      return this.mapRowToWeatherData(data)
    } catch (error) {
      console.error("Error getting cached weather by location:", error)
      return null
    }
  }

  // Save weather data to cache
  async saveWeatherData(coords: GeolocationCoords, weatherData: WeatherData): Promise<void> {
    try {
      // First, try to update existing record for this city
      const { data: existingData } = await this.supabase
        .from("weather_cache")
        .select("id")
        .eq("city_name", weatherData.location)
        .single()

      const weatherRow = {
        city_name: weatherData.location,
        latitude: coords.latitude,
        longitude: coords.longitude,
        temperature: weatherData.temperature,
        condition: weatherData.condition,
        description: weatherData.description,
        humidity: weatherData.humidity,
        wind_speed: weatherData.windSpeed,
        updated_at: new Date().toISOString(),
      }

      if (existingData) {
        // Update existing record
        const { error } = await this.supabase.from("weather_cache").update(weatherRow).eq("id", existingData.id)

        if (error) {
          console.error("Error updating weather cache:", error)
        }
      } else {
        // Insert new record
        const { error } = await this.supabase.from("weather_cache").insert([weatherRow])

        if (error) {
          console.error("Error inserting weather cache:", error)
        }
      }
    } catch (error) {
      console.error("Error saving weather data:", error)
    }
  }

  // Clean up old weather data (older than 24 hours)
  async cleanupOldWeatherData(): Promise<void> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { error } = await this.supabase.from("weather_cache").delete().lt("updated_at", twentyFourHoursAgo)

      if (error) {
        console.error("Error cleaning up old weather data:", error)
      }
    } catch (error) {
      console.error("Error during weather cleanup:", error)
    }
  }

  private mapRowToWeatherData(row: WeatherCacheRow): WeatherData {
    return {
      temperature: row.temperature,
      condition: row.condition,
      description: row.description,
      location: row.city_name,
      humidity: row.humidity,
      windSpeed: row.wind_speed,
    }
  }
}
