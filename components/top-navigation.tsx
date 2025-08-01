"use client"

import { useState, useEffect } from "react"
import { MapPin, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase/client"

interface WeatherData {
  temperature: number
  description: string
  location: string
  icon: string
}

interface UserProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  is_admin: boolean
}

export function TopNavigation() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [currentTime, setCurrentTime] = useState("")
  const [currentDate, setCurrentDate] = useState("")
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [weatherLoading, setWeatherLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    updateDateTime()
    const interval = setInterval(updateDateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadUserProfile()
    loadWeather()
  }, [])

  const updateDateTime = () => {
    const now = new Date()
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Moscow",
    }

    setCurrentTime(now.toLocaleTimeString("ru-RU", timeOptions))
    setCurrentDate(now.toLocaleDateString("ru-RU", dateOptions))
  }

  const loadUserProfile = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error("User not authenticated:", userError)
        return
      }

      // Получаем профиль пользователя
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error("Profile fetch error:", profileError)
        // Создаем профиль если его нет
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || "",
            avatar_url: user.user_metadata?.avatar_url || "",
          })
          .select()
          .single()

        if (createError) {
          console.error("Profile creation error:", createError)
        } else {
          setProfile(newProfile)
        }
      } else {
        setProfile(profileData)
      }
    } catch (error) {
      console.error("Error loading user profile:", error)
    }
  }

  const loadWeather = async () => {
    try {
      setWeatherLoading(true)

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
            await fetchWeather()
          },
          { timeout: 5000, maximumAge: 300000 }, // 5 секунд таймаут, кэш 5 минут
        )
      } else {
        // Fallback на Москву
        await fetchWeather()
      }
    } catch (error) {
      console.error("Error loading weather:", error)
      setWeatherLoading(false)
    }
  }

  const fetchWeather = async (lat?: number, lon?: number) => {
    try {
      const params = new URLSearchParams()
      if (lat && lon) {
        params.append("lat", lat.toString())
        params.append("lon", lon.toString())
      }

      const response = await fetch(`/api/weather?${params}`)
      if (response.ok) {
        const weatherData = await response.json()
        setWeather(weatherData)
      } else {
        console.error("Weather API error:", response.status)
        // Fallback данные
        setWeather({
          temperature: 20,
          description: "ясно",
          location: "Москва",
          icon: "☀️",
        })
      }
    } catch (error) {
      console.error("Weather fetch error:", error)
      // Fallback данные
      setWeather({
        temperature: 20,
        description: "ясно",
        location: "Москва",
        icon: "☀️",
      })
    } finally {
      setWeatherLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      window.location.href = "/"
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Левая часть - Время и дата */}
        <div className="flex items-center space-x-4">
          <div className="text-left">
            <div className="flex items-center space-x-2">
              <div className="text-sm font-medium text-gray-900">{currentDate}</div>
              {/* Компактная погода на мобильных */}
              {weather && !weatherLoading && (
                <div className="flex items-center space-x-1 sm:hidden">
                  <span className="text-sm">{weather.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{weather.temperature}°C</span>
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">{currentTime}</div>
          </div>

          {/* Полная погода на десктопе */}
          {weather && !weatherLoading && (
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{weather.location}</span>
              <span className="text-lg">{weather.icon}</span>
              <span className="font-medium">{weather.temperature}°C</span>
              <span className="capitalize">{weather.description}</span>
            </div>
          )}

          {/* Загрузка погоды */}
          {weatherLoading && (
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-400">
              <div className="animate-pulse">Загрузка погоды...</div>
            </div>
          )}
        </div>

        {/* Правая часть - Профиль пользователя */}
        <div className="flex items-center space-x-3">
          {/* Десктопная версия */}
          <div className="hidden sm:flex items-center space-x-3">
            {profile && (
              <>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">{profile.full_name || "Пользователь"}</div>
                  {profile.is_admin && <div className="text-xs text-blue-600">Администратор</div>}
                </div>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile.avatar_url || ""} />
                  <AvatarFallback>{profile.full_name ? profile.full_name[0].toUpperCase() : "U"}</AvatarFallback>
                </Avatar>
              </>
            )}
          </div>

          {/* Мобильная версия */}
          <div className="sm:hidden">
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  {profile ? (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={profile.avatar_url || ""} />
                      <AvatarFallback className="text-xs">
                        {profile.full_name ? profile.full_name[0].toUpperCase() : "U"}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="flex flex-col space-y-6 pt-6">
                  {/* Профиль пользователя */}
                  {profile && (
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile.avatar_url || ""} />
                        <AvatarFallback>{profile.full_name ? profile.full_name[0].toUpperCase() : "U"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-gray-900">{profile.full_name || "Пользователь"}</div>
                        {profile.is_admin && <div className="text-sm text-blue-600">Администратор</div>}
                      </div>
                    </div>
                  )}

                  {/* Полная информация о погоде */}
                  {weather && !weatherLoading && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <MapPin className="h-4 w-4 text-gray-500" />
                            <span className="text-sm text-gray-600">{weather.location}</span>
                          </div>
                          <div className="text-lg font-semibold text-gray-900 mt-1">{weather.temperature}°C</div>
                          <div className="text-sm text-gray-600 capitalize">{weather.description}</div>
                        </div>
                        <div className="text-3xl">{weather.icon}</div>
                      </div>
                    </div>
                  )}

                  {/* Кнопка выхода */}
                  <div className="pt-4 border-t">
                    <Button variant="outline" onClick={handleSignOut} className="w-full bg-transparent">
                      Выйти
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </div>
  )
}
