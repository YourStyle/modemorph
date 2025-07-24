"use client"

import { useState, useEffect } from "react"
import { Sun, Cloud, CloudRain, CloudSnowIcon as Snow } from "lucide-react"
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
  icon: string
  temp: number
  description: string
}

interface UserProfile {
  email: string
  full_name?: string
  is_admin?: boolean
}

export function TopNavigation() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [weather, setWeather] = useState<WeatherData | null>(null)
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

    // Симуляция погоды
    setWeather({
      temperature: 22,
      condition: "sunny",
      icon: "sun",
      temp: 22,
      description: "Солнечно",
    })

    return () => clearInterval(timer)
  }, [supabase])

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
            {weather && (
              <div className="flex items-center space-x-1 sm:space-x-2">
                {getWeatherIcon(weather.condition)}
                <span className="text-sm sm:text-base text-gray-700">{weather.temp}°</span>
                {/* Описание погоды только на больших экранах */}
                <span className="hidden sm:inline text-sm text-gray-600">{weather.description}</span>
              </div>
            )}
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
              <DropdownMenuItem onClick={() => router.push("/app/avatar")}>Аватар</DropdownMenuItem>
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
