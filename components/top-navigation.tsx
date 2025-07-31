"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { User, Settings, LogOut, MapPin, Thermometer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface WeatherData {
  location: string
  temperature: number
  description: string
  icon: string
}

interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
}

export function TopNavigation() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadUserAndWeather()
  }, [])

  const loadUserAndWeather = async () => {
    try {
      // Загружаем пользователя
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (authUser) {
        // Загружаем профиль пользователя
        try {
          const profileResponse = await fetch("/api/user-profile")
          if (profileResponse.ok) {
            const profile = await profileResponse.json()
            setUser(profile)
          }
        } catch (error) {
          console.error("Error loading profile:", error)
        }
      }

      // Загружаем погоду
      loadWeather()
    } catch (error) {
      console.error("Error loading user and weather:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadWeather = async () => {
    try {
      // Пытаемся получить геолокацию
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords
            await fetchWeather(latitude, longitude)
          },
          async () => {
            // Если геолокация недоступна, используем Москву по умолчанию
            await fetchWeather()
          },
          { timeout: 5000 },
        )
      } else {
        await fetchWeather()
      }
    } catch (error) {
      console.error("Error loading weather:", error)
      await fetchWeather()
    }
  }

  const fetchWeather = async (lat?: number, lon?: number) => {
    try {
      const params = new URLSearchParams()
      if (lat && lon) {
        params.append("lat", lat.toString())
        params.append("lon", lon.toString())
      }

      const response = await fetch(`/api/weather?${params.toString()}`)
      if (response.ok) {
        const weatherData = await response.json()
        setWeather(weatherData)
      }
    } catch (error) {
      console.error("Error fetching weather:", error)
      // Устанавливаем fallback данные
      setWeather({
        location: "Москва",
        temperature: 20,
        description: "Ясно",
        icon: "01d",
      })
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/auth/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const formatDate = () => {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
    }
    return now.toLocaleDateString("ru-RU", options)
  }

  const formatTime = () => {
    const now = new Date()
    return now.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse"></div>
        </div>
      </header>
    )
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left side - Date, Time, Weather */}
        <div className="flex items-center space-x-6">
          <div className="text-sm text-gray-600">
            <div className="font-medium">{formatDate()}</div>
            <div className="text-xs">{formatTime()}</div>
          </div>

          {weather && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <MapPin className="h-3 w-3" />
              <span>{weather.location}</span>
              <div className="flex items-center space-x-1">
                <Thermometer className="h-3 w-3" />
                <span>{weather.temperature}°C</span>
              </div>
              <span className="text-xs">{weather.description}</span>
            </div>
          )}
        </div>

        {/* Right side - User menu */}
        <div className="flex items-center space-x-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                    <AvatarFallback>
                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {user.full_name && <p className="font-medium">{user.full_name}</p>}
                    <p className="w-[200px] truncate text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/app/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Профиль</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Настройки</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Выйти</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" onClick={() => router.push("/auth/login")}>
              Войти
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
