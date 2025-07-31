"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Cloud, Sun, CloudRain, CloudSnowIcon as Snow, Zap, Eye, Wind } from "lucide-react"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  is_admin?: boolean
}

interface WeatherData {
  temperature: number
  condition: string
  description: string
  city: string
}

const getWeatherIcon = (condition: string) => {
  switch (condition.toLowerCase()) {
    case "clear":
      return <Sun className="h-4 w-4 text-yellow-500" />
    case "clouds":
      return <Cloud className="h-4 w-4 text-gray-500" />
    case "rain":
    case "drizzle":
      return <CloudRain className="h-4 w-4 text-blue-500" />
    case "snow":
      return <Snow className="h-4 w-4 text-blue-200" />
    case "thunderstorm":
      return <Zap className="h-4 w-4 text-purple-500" />
    case "mist":
    case "fog":
      return <Eye className="h-4 w-4 text-gray-400" />
    default:
      return <Wind className="h-4 w-4 text-gray-400" />
  }
}

export function TopNavigation() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError) {
          console.error("Auth error:", authError)
          return
        }

        if (authUser) {
          try {
            const response = await fetch("/api/user-profile")
            if (response.ok) {
              const { profile } = await response.json()
              setUser({
                id: authUser.id,
                email: authUser.email || "",
                full_name: profile?.full_name,
                is_admin: profile?.is_admin,
              })
            } else {
              // Если профиль не найден, создаем его
              const createResponse = await fetch("/api/user-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  full_name: authUser.user_metadata?.full_name || "",
                }),
              })

              if (createResponse.ok) {
                const { profile } = await createResponse.json()
                setUser({
                  id: authUser.id,
                  email: authUser.email || "",
                  full_name: profile?.full_name,
                  is_admin: profile?.is_admin,
                })
              }
            }
          } catch (error) {
            console.error("Profile error:", error)
            // Fallback: используем данные из auth
            setUser({
              id: authUser.id,
              email: authUser.email || "",
              full_name: authUser.user_metadata?.full_name,
              is_admin: false,
            })
          }
        }
      } catch (error) {
        console.error("User loading error:", error)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  useEffect(() => {
    const loadWeather = async () => {
      try {
        // Пытаемся получить геолокацию
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const response = await fetch(
                  `/api/weather?lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
                )
                if (response.ok) {
                  const data = await response.json()
                  setWeather(data)
                }
              } catch (error) {
                console.error("Weather fetch error:", error)
              } finally {
                setWeatherLoading(false)
              }
            },
            async () => {
              // Fallback: погода для Москвы
              try {
                const response = await fetch("/api/weather")
                if (response.ok) {
                  const data = await response.json()
                  setWeather(data)
                }
              } catch (error) {
                console.error("Weather fallback error:", error)
              } finally {
                setWeatherLoading(false)
              }
            },
            { timeout: 5000 },
          )
        } else {
          // Геолокация не поддерживается
          try {
            const response = await fetch("/api/weather")
            if (response.ok) {
              const data = await response.json()
              setWeather(data)
            }
          } catch (error) {
            console.error("Weather error:", error)
          } finally {
            setWeatherLoading(false)
          }
        }
      } catch (error) {
        console.error("Weather loading error:", error)
        setWeatherLoading(false)
      }
    }

    loadWeather()
  }, [])

  const handleSignOut = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/auth/login")
    } catch (error) {
      console.error("Sign out error:", error)
      // Принудительно перенаправляем на страницу входа
      window.location.href = "/auth/login"
    }
  }

  const getUserInitials = () => {
    if (user?.full_name) {
      return user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return user?.email?.[0]?.toUpperCase() || "U"
  }

  if (loading) {
    return (
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
        </div>
      </nav>
    )
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-900">ModeMorph</h1>

          {/* Weather widget */}
          {!weatherLoading && weather && (
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full">
              {getWeatherIcon(weather.condition)}
              <span>{weather.temperature}°C</span>
              <span className="text-xs">{weather.city}</span>
            </div>
          )}
        </div>

        {/* Navigation links - только на десктопе */}
        <div className="hidden md:flex items-center space-x-2">
          <Button variant={pathname === "/app" ? "default" : "ghost"} onClick={() => router.push("/app")} size="sm">
            Главная
          </Button>
          <Button
            variant={pathname === "/app/wardrobe" ? "default" : "ghost"}
            onClick={() => router.push("/app/wardrobe")}
            size="sm"
          >
            Гардероб
          </Button>
          <Button
            variant={pathname === "/app/looks" ? "default" : "ghost"}
            onClick={() => router.push("/app/looks")}
            size="sm"
          >
            Образы
          </Button>
          <Button
            variant={pathname === "/app/inspiration" ? "default" : "ghost"}
            onClick={() => router.push("/app/inspiration")}
            size="sm"
          >
            Вдохновение
          </Button>
        </div>

        {/* User menu */}
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-sm">{getUserInitials()}</AvatarFallback>
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
    </nav>
  )
}
