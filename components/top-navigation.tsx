"use client"

import { useState, useEffect } from "react"
import { Sun, Cloud, CloudRain, CloudSnowIcon as Snow, MapPin, RefreshCw } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface WeatherData {
  temperature: number
  condition: string
  description: string
  location: string
  humidity: number
  windSpeed: number
  icon: string
  fromCache?: boolean
}

interface UserProfile {
  email: string
  full_name?: string
  is_admin?: boolean
}

interface GeolocationCoords {
  latitude: number
  longitude: number
}

export function TopNavigation() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherRefreshing, setWeatherRefreshing] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    // Загружаем данные пользователя
    const loadUser = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (authUser) {
        const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", authUser.id).single()

        setUser({
          email: authUser.email || "",
          full_name: profile?.full_name,
          is_admin: profile?.is_admin,
        })
      }
    }

    loadUser()

    // Загружаем погоду
    const fetchWeather = async () => {
      try {
        // Get user's location
        if (!navigator.geolocation) {
          throw new Error("Geolocation not supported")
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            enableHighAccuracy: false,
            maximumAge: 300000, // 5 minutes
          })
        })

        const { latitude, longitude } = position.coords

        // Fetch weather from our API
        const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)

        if (!response.ok) {
          throw new Error("Weather service unavailable")
        }

        const weatherData = await response.json()
        setWeather(weatherData)
        setWeatherError(null)
      } catch (err) {
        console.error("Weather fetch error:", err)
        setWeatherError("Погода недоступна")
        setWeather(null)
      } finally {
        setWeatherLoading(false)
      }
    }

    fetchWeather()

    return () => clearInterval(timer)
  }, [supabase])

  const getLocation = (): Promise<GeolocationCoords> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        },
        (error) => {
          // Fallback to Moscow coordinates if geolocation fails
          console.warn("Geolocation failed, using Moscow coordinates:", error)
          resolve({
            latitude: 55.7558,
            longitude: 37.6176,
          })
        },
        {
          timeout: 10000,
          enableHighAccuracy: false,
        },
      )
    })
  }

  const loadWeather = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setWeatherRefreshing(true)
      } else {
        setWeatherLoading(true)
      }
      setWeatherError(null)

      // Get user location
      const coords = await getLocation()

      // Call our server-side weather API
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(coords),
        cache: forceRefresh ? "no-cache" : "default",
      })

      if (!response.ok) {
        throw new Error(`Weather API request failed: ${response.status}`)
      }

      const result = await response.json()

      if (result.error) {
        throw new Error(result.error)
      }

      setWeather(result)
      setWeatherError(null)
    } catch (error) {
      console.error("Failed to load weather:", error)
      setWeatherError("Погода недоступна")
      setWeather(null)
    } finally {
      setWeatherLoading(false)
      setWeatherRefreshing(false)
    }
  }

  const handleRefreshWeather = () => {
    loadWeather(true)
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case "sunny":
        return <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
      case "cloudy":
        return <Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
      case "rainy":
        return <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
      case "snowy":
        return <Snow className="w-4 h-4 sm:w-5 sm:h-5 text-blue-300" />
      default:
        return <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const getUserInitials = () => {
    if (user?.full_name) {
      return user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    }
    return user?.email?.[0]?.toUpperCase() || "U"
  }

  return (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between">
        {/* Левая часть - Дата и время */}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{formatDate(currentTime)}</h1>
          <div className="flex items-center space-x-2 sm:space-x-4 mt-1">
            <p className="text-sm sm:text-lg text-gray-600">{formatTime(currentTime)}</p>

            {/* Погода */}
            <div className="flex items-center space-x-1 sm:space-x-2">
              <div
                className="flex items-center space-x-1 sm:space-x-2 cursor-pointer group"
                title={`${weather?.location}: ${weather?.description}, влажность ${weather?.humidity}%, ветер ${weather?.windSpeed} м/с`}
              >
                {weatherLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-200 rounded animate-pulse" />
                    <div className="w-8 h-4 bg-gray-200 rounded animate-pulse" />
                  </div>
                ) : weatherError ? (
                  <div className="flex items-center space-x-1 sm:space-x-2 text-gray-400">
                    <Cloud className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="text-xs sm:text-sm">{weatherError}</span>
                  </div>
                ) : weather ? (
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    {getWeatherIcon(weather.condition)}
                    <span className="text-sm sm:text-base text-gray-700">{weather.temperature}°</span>
                    {/* Описание погоды только на больших экранах */}
                    <span className="hidden sm:inline text-sm text-gray-600">{weather.description}</span>
                    <MapPin className="hidden sm:inline w-3 h-3 text-gray-400 group-hover:text-gray-600" />
                    <span className="hidden lg:inline text-xs text-gray-500">{weather.location}</span>
                  </div>
                ) : null}

                {/* Кнопка обновления погоды */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshWeather}
                  disabled={weatherRefreshing}
                  className="h-6 w-6 p-0 hover:bg-gray-100"
                  title="Обновить погоду"
                >
                  <RefreshCw
                    className={`w-3 h-3 text-gray-400 hover:text-gray-600 ${weatherRefreshing ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Правая часть - Аватар */}
        <div className="flex-shrink-0 ml-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 sm:h-10 sm:w-10 rounded-full">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-xs sm:text-sm">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none">{user?.full_name || "Пользователь"}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              {user?.is_admin && (
                <>
                  <DropdownMenuItem onClick={() => router.push("/admin")}>Панель администратора</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
