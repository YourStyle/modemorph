"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { MapPin, User } from "lucide-react"
import { UserProfileSheet } from "./user-profile-sheet"

interface Weather {
  city_name: string
  temperature: number
  condition: string
  description: string
  humidity: number
  wind_speed: number
  icon: string
}

export function TopNavigation() {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [location, setLocation] = useState<string>("")
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    getCurrentLocation()
  }, [])

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          console.log("Got coordinates:", latitude, longitude)

          try {
            // Get weather data
            const weatherResponse = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)
            if (weatherResponse.ok) {
              const weatherData = await weatherResponse.json()
              console.log("Weather data:", weatherData)
              setWeather(weatherData)
              setLocation(weatherData.city_name)
            } else {
              console.error("Weather API error:", weatherResponse.status)
              setLocation("Местоположение недоступно")
            }
          } catch (error) {
            console.error("Error fetching weather:", error)
            setLocation("Ошибка получения погоды")
          }
        },
        (error) => {
          console.error("Geolocation error:", error)
          setLocation("Местоположение недоступно")
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        },
      )
    } else {
      console.error("Geolocation not supported")
      setLocation("Геолокация не поддерживается")
    }
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">{location}</span>
          {weather && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-lg">{weather.icon}</span>
              <span className="text-sm font-medium">{weather.temperature}°C</span>
              <span className="text-xs text-gray-500 capitalize">{weather.description}</span>
            </div>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => setIsProfileOpen(true)} className="p-2">
          <User className="w-5 h-5" />
        </Button>
      </div>

      <UserProfileSheet isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  )
}
