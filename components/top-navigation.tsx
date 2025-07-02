"use client"

import { HelpCircle, Bell, User, Cloud, Sun, CloudRain, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function TopNavigation() {
  const [weather, setWeather] = useState({ temp: 22, condition: "sunny" })
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    async function getUser() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setUser(user)

        // Получаем профиль пользователя
        try {
          const response = await fetch("/api/user-profile")
          if (response.ok) {
            const { profile } = await response.json()
            setProfile(profile)
          }
        } catch (error) {
          console.error("Error fetching profile:", error)
        }
      }
    }

    getUser()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const today = new Date()
  const dayNames = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"]
  const monthNames = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]

  const dayName = dayNames[today.getDay()]
  const day = today.getDate().toString().padStart(2, "0")
  const month = monthNames[today.getMonth()]

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case "sunny":
        return <Sun className="h-4 w-4 text-yellow-500" />
      case "cloudy":
        return <Cloud className="h-4 w-4 text-gray-500" />
      case "rainy":
        return <CloudRain className="h-4 w-4 text-blue-500" />
      default:
        return <Sun className="h-4 w-4 text-yellow-500" />
    }
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
      {/* Левая часть - дата и погода */}
      <div className="flex items-center gap-6">
        {/* Дата */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-800">{day}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wide">{month}</span>
              <span className="text-sm font-medium text-gray-700 capitalize">{dayName}</span>
            </div>
          </div>
        </div>

        {/* Погода */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
          {getWeatherIcon(weather.condition)}
          <span className="text-sm font-medium text-gray-700">{weather.temp}°</span>
        </div>
      </div>

      {/* Правая часть - иконки */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="p-2.5 h-auto text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="p-2.5 h-auto text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" onClick={handleSignOut} size="sm" className="p-2.5 h-auto text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                      <LogOut className="h-5 w-5" />
        </Button>
        {/* Выпадающее меню профиля */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="p-2.5 h-auto text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-gray-900">{profile?.full_name || user?.email || "Пользователь"}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            {profile?.is_admin && (
              <>
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Панель администратора
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
