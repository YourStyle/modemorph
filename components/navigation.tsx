"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Home, Shirt, Heart, Sparkles, BookOpen, User, Settings, LogOut, Menu, MapPin, Thermometer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

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

const navigationItems = [
  {
    name: "Главная",
    href: "/app",
    icon: Home,
  },
  {
    name: "Гардероб",
    href: "/app/wardrobe",
    icon: Shirt,
  },
  {
    name: "ИИ",
    href: "/app/ai-assistant",
    icon: Sparkles,
  },
  {
    name: "Идеи",
    href: "/app/inspiration",
    icon: Heart,
  },
  {
    name: "Образы",
    href: "/app/lookbook",
    icon: BookOpen,
  },
]

export function Navigation() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
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

  const NavigationContent = () => (
    <nav className="space-y-1">
      {navigationItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
              isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
            onClick={() => setMobileMenuOpen(false)}
          >
            <item.icon className="mr-3 h-5 w-5" />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )

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
    <>
      {/* Desktop Navigation */}
      <header className="hidden md:block bg-white border-b border-gray-200 px-4 py-3">
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

          {/* Center - Navigation */}
          <div className="flex items-center space-x-1">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                </Link>
              )
            })}
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

      {/* Mobile Navigation */}
      <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Menu button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <div className="py-4">
                <NavigationContent />
              </div>
            </SheetContent>
          </Sheet>

          {/* Center - Weather */}
          {weather && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <MapPin className="h-3 w-3" />
              <span>{weather.location}</span>
              <div className="flex items-center space-x-1">
                <Thermometer className="h-3 w-3" />
                <span>{weather.temperature}°C</span>
              </div>
            </div>
          )}

          {/* Right side - User menu */}
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
      </header>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50">
        <div className="flex justify-around items-center max-w-md mx-auto">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Button
                key={item.name}
                variant="ghost"
                size="sm"
                onClick={() => router.push(item.href)}
                className={`flex flex-col items-center space-y-1 h-auto py-2 px-3 ${
                  isActive ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-blue-600" : ""}`} />
                <span className="text-xs font-medium">{item.name}</span>
              </Button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
