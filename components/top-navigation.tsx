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
      condition: "Солнечно",
      icon: "sun",
    })

    return () => clearInterval(timer)
  }, [supabase])

  const getWeatherIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "солнечно":
      case "ясно":
        return <Sun className="h-4 w-4 text-yellow-500" />
      case "облачно":
        return <Cloud className="h-4 w-4 text-gray-500" />
      case "дождь":
        return <CloudRain className="h-4 w-4 text-blue-500" />
      case "снег":
        return <Snow className="h-4 w-4 text-blue-300" />
      default:
        return <Sun className="h-4 w-4 text-yellow-500" />
    }
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
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Левая часть - Дата и время */}
        <div className="flex flex-col">
          <h1 className="text-2xl font-serif font-semibold text-gray-900 capitalize">{formatDate(currentTime)}</h1>
          <p className="text-lg text-gray-600 font-mono">{formatTime(currentTime)}</p>
        </div>

        {/* Правая часть - Погода и профиль */}
        <div className="flex items-center space-x-6">
          {/* Погода */}
          {weather && (
            <div className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-full">
              {getWeatherIcon(weather.condition)}
              <span className="text-sm font-medium text-gray-700">{weather.temperature}°C</span>
              <span className="text-sm text-gray-600">{weather.condition}</span>
            </div>
          )}

          {/* Профиль с выпадающим меню */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gray-200 text-gray-700">{getUserInitials()}</AvatarFallback>
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
