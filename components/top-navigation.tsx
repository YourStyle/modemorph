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
import { User, Settings, LogOut, Cloud, Sun, CloudRain, Snowflake } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface WeatherData {
  temperature: number
  description: string
  location: string
  icon: string
  error?: string
}

interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  is_admin?: boolean
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
            const { profile } = await profileResponse.json()
            setUser(profile)
          } else {
            // Fallback к данным из auth
            setUser({
              id: authUser.id,
              email: authUser.email || "",
              full_name: authUser.user_metadata?.full_name,
              avatar_url: authUser.user_metadata?.avatar_url,
            })
          }
        } catch (error) {
          console.error("Error loading profile:", error)
          // Fallback к данным из auth
          setUser({
            id: authUser.id,
            email: authUser.email || "",
            full_name: authUser.user_metadata?.full_name,
            avatar_url: authUser.user_metadata?.avatar_url,
          })
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
          async (error) => {
            console.log("Geolocation error:", error)
            // Fallback на Москву
            await fetchWeather(55.7558, 37.6176)
          },
          { timeout: 5000, maximumAge: 300000 }, // 5 секунд таймаут, кэш 5 минут
        )
      } else {
        // Fallback на Москву
        await fetchWeather(55.7558, 37.6176)
      }
    } catch (error) {
      console.error("Error loading weather:", error)
      // Устанавливаем fallback погоду
      setWeather({
        temperature: 20,
        description: "Ясно",
        location: "Москва",
        icon: "☀️",
      })
    }
  }

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      const data = await response.json()
      setWeather(data)
    } catch (error) {
      console.error("Weather fetch error:", error)
      setWeather({
        temperature: 20,
        description: "Ясно",
        location: "Москва",
        icon: "☀️",
        error: "Weather unavailable",
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

  const getWeatherIcon = (iconText: string) => {
    switch (iconText) {
      case "☀️":
        return <Sun className="h-4 w-4" />
      case "⛅":
      case "☁️":
        return <Cloud className="h-4 w-4" />
      case "🌧️":
      case "🌦️":
        return <CloudRain className="h-4 w-4" />
      case "❄️":
        return <Snowflake className="h-4 w-4" />
      default:
        return <Sun className="h-4 w-4" />
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
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center space-x-4">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse"></div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white border-b">
      {/* Left side - Date and Weather */}
      <div className="flex items-center space-x-4">
        <div className="text-sm text-gray-600">
          <div className="font-medium">{formatDate()}</div>
          <div className="text-xs text-gray-500">{formatTime()}</div>
        </div>

        {weather && (
          <div className="flex items-center space-x-2 text-sm">
            {getWeatherIcon(weather.icon)}
            <span className="font-medium">{weather.temperature}°</span>
            <span className="text-gray-600 hidden sm:inline">{weather.description}</span>
            {weather.location && <span className="text-gray-500 text-xs hidden md:inline">{weather.location}</span>}
          </div>
        )}
      </div>

      {/* Right side - User menu */}
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatar_url || "/placeholder.svg"} alt={user.full_name || user.email} />
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
            {user.is_admin && (
              <DropdownMenuItem onClick={() => router.push("/admin")}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Админ панель</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Выйти</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => router.push("/auth/login")}>
          Войти
        </Button>
      )}
    </div>
  )
}
