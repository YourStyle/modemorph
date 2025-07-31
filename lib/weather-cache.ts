import { createClient } from "@/lib/supabase/server"

interface WeatherData {
  temperature: number
  condition: string
  description: string
  location: string
  humidity: number
  windSpeed: number
}

interface GeolocationCoords {
  latitude: number
  longitude: number
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

export class WeatherCache {
  private supabase = createClient()

  /**
   * Get cached weather data by city name
   * Returns data only if it's less than 1 hour old
   */
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
      console.error("Error getting cached weather by city:", error)
      return null
    }
  }

  /**
   * Get cached weather data by location coordinates
   * Searches within approximately 11km radius (0.1 degrees)
   * Returns data only if it's less than 1 hour old
   */
  async getCachedWeatherByLocation(coords: GeolocationCoords): Promise<WeatherData | null> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const radius = 0.1 // Approximately 11km

      const { data, error } = await this.supabase
        .from("weather_cache")
        .select("*")
        .gte("latitude", coords.latitude - radius)
        .lte("latitude", coords.latitude + radius)
        .gte("longitude", coords.longitude - radius)
        .lte("longitude", coords.longitude + radius)
        .gte("updated_at", oneHourAgo)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (error || !data || data.length === 0) {
        return null
      }

      // Find the closest location
      let closestData = data[0]
      let minDistance = this.calculateDistance(coords, {
        latitude: data[0].latitude,
        longitude: data[0].longitude,
      })

      for (const row of data) {
        const distance = this.calculateDistance(coords, {
          latitude: row.latitude,
          longitude: row.longitude,
        })
        if (distance < minDistance) {
          minDistance = distance
          closestData = row
        }
      }

      return this.mapRowToWeatherData(closestData)
    } catch (error) {
      console.error("Error getting cached weather by location:", error)
      return null
    }
  }

  /**
   * Save weather data to cache
   * Updates existing record if found, otherwise creates new one
   */
  async saveWeatherData(coords: GeolocationCoords, weatherData: WeatherData): Promise<void> {
    try {
      const radius = 0.05 // Approximately 5.5km for updates

      // Check if we have a recent record for this location
      const { data: existingData } = await this.supabase
        .from("weather_cache")
        .select("id")
        .gte("latitude", coords.latitude - radius)
        .lte("latitude", coords.latitude + radius)
        .gte("longitude", coords.longitude - radius)
        .lte("longitude", coords.longitude + radius)
        .eq("city_name", weatherData.location)
        .limit(1)

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

      if (existingData && existingData.length > 0) {
        // Update existing record
        const { error } = await this.supabase.from("weather_cache").update(weatherRow).eq("id", existingData[0].id)

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

  /**
   * Clean up old weather data (older than 24 hours)
   */
  async cleanupOldWeatherData(): Promise<void> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { error } = await this.supabase.from("weather_cache").delete().lt("updated_at", twentyFourHoursAgo)

      if (error) {
        console.error("Error cleaning up old weather data:", error)
      } else {
        console.log("Old weather data cleaned up successfully")
      }
    } catch (error) {
      console.error("Error in cleanup process:", error)
    }
  }

  /**
   * Calculate distance between two coordinates in degrees
   */
  private calculateDistance(coords1: GeolocationCoords, coords2: GeolocationCoords): number {
    const latDiff = coords1.latitude - coords2.latitude
    const lonDiff = coords1.longitude - coords2.longitude
    return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff)
  }

  /**
   * Map database row to WeatherData interface
   */
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
