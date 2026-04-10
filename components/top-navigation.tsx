"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { MapPin, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileSheet } from "./user-profile-sheet"
import { api } from "@/lib/api-client"

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
  const router = useRouter()
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [currentTime, setCurrentTime] = useState("")
  const [currentDate, setCurrentDate] = useState("")
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false)
  const [weekdayShort, setWeekdayShort] = useState("")

  const [isTmaMobile, setIsTmaMobile] = useState(false)

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

    // Listen for avatar updates from profile sheet
    const handleAvatarUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.avatar_url) {
        setProfile((prev) => prev ? { ...prev, avatar_url: detail.avatar_url } : null)
      }
    }
    window.addEventListener("profile:avatar-updated", handleAvatarUpdate)
    return () => window.removeEventListener("profile:avatar-updated", handleAvatarUpdate)
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
      const isMobile = /ios|android/.test(platform)
      if (inTma && isMobile) {
        setIsTmaMobile(true)
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
      const data = await api.get("/api/me/profile-session")

      if (data?.profile) {
        // Redirect to onboarding if admin reset the flag
        if (data.profile.onboarding_complete === false) {
          router.push("/auth/mini-registration")
          return
        }

        setProfile({
          id: data.profile.id,
          full_name: data.profile.full_name,
          avatar_url: data.profile.avatar_url,
          is_admin: data.profile.is_admin || false,
        })
      } else if (data?.user) {
        // No profile yet — redirect to onboarding
        router.push("/auth/mini-registration")
      }
    } catch {
      // ignore profile loading errors
    }
  }

  const loadWeather = async () => {
    try {
      setWeatherLoading(true)

      // Сначала пробуем загрузить кэшированную погоду
      try {
        const cachedWeather = await api.get("/api/weather/cached")
        setWeather({
          temperature: cachedWeather.temperature,
          description: cachedWeather.description,
          location: cachedWeather.location,
          icon: cachedWeather.icon || "🌤️",
        })
        setWeatherLoading(false)
        return
      } catch {
        // ignore cache errors
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords
            await fetchWeather(latitude, longitude)
          },
          async () => {
            // Fallback на Москву
            await fetchWeather(55.7558, 37.6176)
          },
          { timeout: 5000, maximumAge: 300000 }, // 5 секунд таймаут, кэш 5 минут
        )
      } else {
        // Fallback на Москву
        await fetchWeather(55.7558, 37.6176)
      }
    } catch {
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
      const weatherData = await api.get(`/api/weather?lat=${lat}&lon=${lon}`)

      setWeather({
        temperature: weatherData.temperature,
        description: weatherData.description,
        location: weatherData.location,
        icon: weatherData.icon || "🌤️",
      })
    } catch {
      // Fallback данные при ошибке API
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
      await api.post("/api/auth/signout")
      window.location.href = "/"
    } catch {
      // ignore
    }
  }

  const handleProfileClick = () => {
    setIsProfileSheetOpen(true)
  }

  if (isTmaMobile) {
    return (
      <>
        <div
          className="fixed inset-x-0 top-0 z-40 bg-gray-50"
          style={{ height: "calc(env(safe-area-inset-top, 0px) + 70px)", pointerEvents: "auto" }}
        />
        <div className="fixed inset-x-0 top-0 flex justify-center pointer-events-none z-50">
          <div className="mt-[60px] pointer-events-auto">
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

              {/* Аватар профиля */}
              {profile ? (
                <Avatar className="w-7 h-7 ml-1 ring-2 ring-blue-400/60 ring-offset-1 ring-offset-background/80">
                  <AvatarImage
                    src={profile.avatar_url ?? undefined}
                    alt={profile.full_name ?? "User"}
                  />
                  <AvatarFallback className="text-xs bg-blue-500 text-white font-semibold">
                    {profile.full_name
                      ? profile.full_name.charAt(0).toUpperCase()
                      : "U"}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-7 h-7 ml-1 rounded-full bg-blue-500/20 ring-2 ring-blue-400/60 ring-offset-1 ring-offset-background/80 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
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
