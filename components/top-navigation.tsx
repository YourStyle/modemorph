"use client"

import { useState, useEffect } from "react"
import { MapPin, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/client"
import { UserProfileSheet } from "./user-profile-sheet"

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
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false)
  const [weekdayShort, setWeekdayShort] = useState("")

  const [isTmaIos, setIsTmaIos] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    updateDateTime()
    const interval = setInterval(updateDateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    updateWeekday()
    // обновлять раз в час достаточно, но можно и реже.
    const interval = setInterval(updateWeekday, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadUserProfile()
    loadWeather()
  }, [])

  useEffect(() => {
    try {
      const tg = typeof window !== "undefined"
        ? (window as any).Telegram?.WebApp
        : undefined
      const hasInit =
        !!tg?.initData && String(tg.initData).trim().length > 0
      const hasUser =
        !!tg?.initDataUnsafe?.user?.id ||
        !!tg?.initDataUnsafe?.query_id
      const platform = String(tg?.platform || "").toLowerCase()
      const inTma =
        hasInit && hasUser && platform && platform !== "unknown"
      const isIos = /ios/.test(platform)
      if (inTma && isIos) {
        setIsTmaIos(true)
      }
    } catch {
      // игнорируем ошибки определения
    }
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

  const updateWeekday = () => {
    const now = new Date()
    // ru-RU, короткий день недели. Часто даёт "пн", "вт", "ср" с точкой у некоторых локалей,
    // уберём точку и сделаем первую букву заглавной.
    const raw = now
      .toLocaleDateString("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" })
      .replace(".", "")
    const pretty = raw.charAt(0).toUpperCase() + raw.slice(1)
    setWeekdayShort(pretty)
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

      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (profileError) {
        console.error("Profile fetch error:", profileError)

        const { data: newProfile, error: createError } = await supabase
          .from("user_profiles")
          .insert({
            user_id: user.id,
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
      console.log("Starting weather loading...")

      // Сначала пробуем загрузить кэшированную погоду
      try {
        console.log("Trying to load cached weather...")
        const cachedResponse = await fetch("/api/weather/cached")
        if (cachedResponse.ok) {
          const cachedWeather = await cachedResponse.json()
          console.log("Cached weather loaded:", cachedWeather)
          setWeather({
            temperature: cachedWeather.temperature,
            description: cachedWeather.description,
            location: cachedWeather.location,
            icon: cachedWeather.icon || "🌤️",
          })
          setWeatherLoading(false)
          return
        } else {
          console.log("No cached weather available, status:", cachedResponse.status)
        }
      } catch (error) {
        console.log("Error loading cached weather:", error)
      }

      // Если кэша нет, пытаемся получить геолокацию
      if (navigator.geolocation) {
        console.log("Requesting geolocation...")
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords
            console.log("Geolocation obtained:", { latitude, longitude })
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
        console.log("Geolocation not supported, using Moscow coordinates")
        // Fallback на Москву
        await fetchWeather(55.7558, 37.6176)
      }
    } catch (error) {
      console.error("Error loading weather:", error)
      setWeatherLoading(false)
      // Устанавливаем fallback данные только при критической ошибке
      setWeather({
        temperature: 20,
        description: "ясно",
        location: "Москва",
        icon: "☀️",
      })
    }
  }

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      console.log(`Fetching weather for coordinates: ${lat}, ${lon}`)

      const url = `/api/weather?lat=${lat}&lon=${lon}`
      console.log("Weather API URL:", url)

      const response = await fetch(url)
      console.log("Weather API response status:", response.status)

      if (response.ok) {
        const weatherData = await response.json()
        console.log("Weather data received:", weatherData)

        setWeather({
          temperature: weatherData.temperature,
          description: weatherData.description,
          location: weatherData.location,
          icon: weatherData.icon || "🌤️",
        })
      } else {
        const errorData = await response.text()
        console.error("Weather API error:", response.status, errorData)

        // Fallback данные при ошибке API
        setWeather({
          temperature: 20,
          description: "ясно",
          location: "Москва",
          icon: "☀️",
        })
      }
    } catch (error) {
      console.error("Weather fetch error:", error)
      // Fallback данные при ошибке сети
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
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      })
      window.location.href = "/"
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  const handleProfileClick = () => {
    setIsProfileSheetOpen(true)
  }

  if (isTmaIos) {
    return (
      <>
        <div
          className="fixed inset-x-0 top-0 z-40 bg-background"
          style={{ height: "calc(env(safe-area-inset-top, 0px) + 20px)", pointerEvents: "auto" }}
        />
        <div className="fixed inset-x-0 top-0 flex justify-center pointer-events-none z-50">
          <div className="mt-[95px] pointer-events-auto">
            <button
              onClick={handleProfileClick}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-background/80 backdrop-blur text-foreground shadow-md"
            >
              {/* Только короткий день недели, меньше шрифт */}
              <span className="text-xs font-medium whitespace-nowrap">
                {weekdayShort}
              </span>

              {/* Компактная погода: без времени, маленький текст */}
              {weather && !weatherLoading && (
                <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
                  <span>{weather.icon}</span>
                  <span>{weather.temperature}°C</span>
                </span>
              )}

              {/* Аватар профиля, ещё чуть компактнее */}
              {profile && (
                <Avatar className="w-5 h-5 ml-1">
                  <AvatarImage
                    src={profile.avatar_url ?? undefined}
                    alt={profile.full_name ?? "User"}
                  />
                  <AvatarFallback className="text-[10px]">
                    {profile.full_name
                      ? profile.full_name.charAt(0).toUpperCase()
                      : "U"}
                  </AvatarFallback>
                </Avatar>
              )}
            </button>
          </div>
        </div>

        {/* ВАЖНО: унифицируем пропсы под isOpen/onClose */}
        <UserProfileSheet
          isOpen={isProfileSheetOpen}
          onClose={() => setIsProfileSheetOpen(false)}
          onSignOut={handleSignOut}
        />
      </>
    )
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
                <Button variant="ghost" size="sm" className="p-1" onClick={handleProfileClick}>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile.avatar_url || ""} />
                    <AvatarFallback>{profile.full_name ? profile.full_name[0].toUpperCase() : "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </>
            )}
          </div>

          {/* Мобильная версия */}
          <div className="sm:hidden">
            <Button variant="ghost" size="sm" className="p-2" onClick={handleProfileClick}>
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
          </div>
        </div>
      </div>
      <UserProfileSheet
        isOpen={isProfileSheetOpen}
        onClose={() => setIsProfileSheetOpen(false)}
        onSignOut={handleSignOut}
      />
    </div>
  )
}
