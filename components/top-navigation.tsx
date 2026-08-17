"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  MapPin,
  User,
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserProfileSheet } from "./user-profile-sheet"
import { api } from "@/lib/api-client"
import { getUserCoords } from "@/lib/tma/geo"
import { CityPickerSheet } from "@/components/city-picker-sheet"
import { useTmaMobile } from "@/hooks/use-tma"
import { cn } from "@/lib/utils"

// Пилюля отступает ТОЛЬКО на безопасный верх плюс зазор. Прибавлять сюда ещё и
// её собственную высоту (как было) значит уронить её вниз на свой же рост.
// Где начинается контент — отдельный токен --tg-content-top в app/globals.css.
const TG_PILL_TOP = "calc(var(--tg-safe-top) + var(--tg-nav-gap))"

interface WeatherData {
  temperature: number
  description: string
  location: string
  /** Эмодзи с бэкенда — больше не рендерим напрямую, оставлен для обратной совместимости. */
  icon: string
  /** OpenWeather "main" (Clear/Clouds/Rain/...) — по нему маппим на lucide-иконку. */
  condition?: string
  country?: string
}

// Погода — иконкой из того же набора, что остальной хром, не эмодзи (другой рендер,
// другая насыщенность, другая оптическая высота рядом с иконкой профиля).
const WEATHER_ICONS: Record<string, LucideIcon> = {
  clear: Sun,
  clouds: Cloud,
  rain: CloudRain,
  drizzle: CloudRain,
  thunderstorm: CloudLightning,
  snow: CloudSnow,
  mist: CloudFog,
  fog: CloudFog,
  haze: CloudFog,
  smoke: CloudFog,
  dust: CloudFog,
  sand: CloudFog,
  ash: CloudFog,
  squall: Wind,
  tornado: Wind,
}

function WeatherIcon({ condition, className }: { condition?: string; className?: string }) {
  const Icon = WEATHER_ICONS[(condition || "").toLowerCase()] || CloudSun
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />
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
  const [currentDate, setCurrentDate] = useState("")
  const [weatherLoading, setWeatherLoading] = useState(true)
  // Объект погоды может приехать без температуры (кэш промахнулся, гео не дали,
  // бэкенд ответил частично). Тогда чип рисовал голое "°C" без числа и выглядел
  // сломанным — показываем чип только когда есть что показать.
  const hasTemperature = weather != null && Number.isFinite(Number(weather.temperature))
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false)
  const [weekdayShort, setWeekdayShort] = useState("")

  const isTmaMobile = useTmaMobile()
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const [showCityHint, setShowCityHint] = useState(false)

  // Тост про город фиксирован под пилюлей, поэтому из потока он выпал и сам
  // контент не двигает. Отдаём его реальную высоту в --tg-hint-h — на неё
  // <main> добавляет отступ, пока тост на экране. Меряем, а не заводим
  // константу: текст переносится на второй строке на узких экранах.
  const cityHintRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = document.documentElement
    const el = cityHintRef.current
    if (!el) {
      root.style.removeProperty("--tg-hint-h")
      return
    }
    const sync = () => root.style.setProperty("--tg-hint-h", `${Math.round(el.getBoundingClientRect().height)}px`)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty("--tg-hint-h")
    }
  }, [showCityHint, weather])

  useEffect(() => {
    // Дата — не часы (их и так показывает ОС в статус-баре), секундный тик ей не
    // нужен. Обновляем раз в час — этого достаточно, чтобы не залипнуть на вчера,
    // если сессия открыта дольше суток.
    updateDateTime()
    updateWeekday()
    const interval = setInterval(() => {
      updateDateTime()
      updateWeekday()
    }, 60 * 60 * 1000)
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

  // Шапка (test/gauntlet/design/LIQUID_GLASS.md): прозрачная наверху страницы,
  // стеклянная после скролла. passive-листенер + rAF-throttle, переключаем только
  // opacity уже смонтированного стеклянного слоя — backdrop-filter никогда не
  // анимируется и не пересчитывается.
  const [isScrolled, setIsScrolled] = useState(false)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 4)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])


  const updateDateTime = () => {
    const now = new Date()
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Moscow",
    }

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

  const FALLBACK_WEATHER: WeatherData = {
    temperature: 20,
    description: "ясно",
    location: "Москва",
    icon: "",
    condition: "Clear",
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
          icon: cachedWeather.icon || "",
          condition: cachedWeather.condition,
        })
        setWeatherLoading(false)
        return
      } catch {
        // ignore cache errors — will try geolocation next
      }

      // TMA-aware геолокация: сначала Telegram LocationManager (показывает
      // настоящий запрос внутри Telegram), затем браузерная геолокация, иначе —
      // Москва. Обычный navigator.geolocation в TMA-вебвью промпт не показывает.
      const coords = await getUserCoords(8000)
      if (coords) {
        await fetchWeather(coords.latitude, coords.longitude)
      } else {
        await fetchWeather(55.7558, 37.6176) // Москва, если геопозиция недоступна
      }
    } catch {
      setWeatherLoading(false)
      setWeather(FALLBACK_WEATHER)
    }
  }

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      const weatherData = await api.get(`/api/weather?lat=${lat}&lon=${lon}`)

      setWeather({
        temperature: weatherData.temperature,
        description: weatherData.description,
        location: weatherData.location,
        icon: weatherData.icon || "",
        condition: weatherData.condition,
      })
    } catch {
      setWeather(FALLBACK_WEATHER)
    } finally {
      setWeatherLoading(false)
    }
  }

  const handleCityPicked = (w: any) => {
    setWeather({
      temperature: w.temperature,
      description: w.description,
      location: w.location,
      icon: w.icon || "",
      condition: w.condition,
      country: w.country || "",
    })
    setShowCityHint(false)
    try { localStorage.setItem("cityHintSeen", "1") } catch {}
  }

  const dismissCityHint = () => {
    setShowCityHint(false)
    try { localStorage.setItem("cityHintSeen", "1") } catch {}
  }

  // Show the "which city/country?" hint once, after weather first resolves.
  useEffect(() => {
    if (weather && !weatherLoading) {
      try {
        if (!localStorage.getItem("cityHintSeen")) setShowCityHint(true)
      } catch {}
    }
  }, [weather, weatherLoading])

  const handleProfileClick = () => {
    setIsProfileSheetOpen(true)
  }

  // Подсказку про город прячем сами, как только человек начал скроллить: она
  // своё отработала, а висеть поверх контента до ручного закрытия ей незачем.
  useEffect(() => {
    if (isScrolled && showCityHint) dismissCityHint()
  }, [isScrolled, showCityHint])

  if (isTmaMobile) {
    return (
      <>
        {/* Подложки под пилюлей нет намеренно: она проявлялась при скролле
            широкой полосой во весь борт и читалась как лишний слой. Пилюля
            стеклянная сама по себе, этого достаточно. */}
        <div className="fixed inset-x-0 top-0 flex justify-center pointer-events-none z-50">
          <div
            className="pointer-events-auto"
            style={{ marginTop: "calc(var(--tg-safe-top) + var(--tg-nav-gap))" }}
          >
            <button
              onClick={handleProfileClick}
              className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-foreground"
            >
              {/* Только короткий день недели, меньше шрифт */}
              <span className="text-xs font-medium whitespace-nowrap">
                {weekdayShort}
              </span>

              {/* Компактная погода: тап → выбор города */}
              {hasTemperature && !weatherLoading && (
                <button
                  type="button"
                  onClick={() => setCityPickerOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"
                  title="Выбрать город"
                >
                  <WeatherIcon condition={weather.condition} className="h-3.5 w-3.5" />
                  <span>{weather.temperature}°C</span>
                </button>
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

        {showCityHint && weather && (
          // Тост фиксирован сразу под пилюлей, а не стоит в потоке. В потоке он
          // отступал на safe-top + gap, и ровно эти же слагаемые ещё раз входили
          // в padding-top у <main> — двойной счёт плюс высота самого тоста, это
          // и был оставшийся провал до контента. Его реальную высоту меряем и
          // отдаём в --tg-hint-h, чтобы контент сдвигался ровно на неё и только
          // пока тост виден.
          <div
            ref={cityHintRef}
            className="fixed inset-x-0 z-40 px-4 py-2 bg-amber-50 text-amber-900 text-xs flex items-center justify-between gap-2"
            style={{ top: "var(--tg-content-top)" }}
          >
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              Погода: {weather.location}
              {weather.country ? `, ${weather.country}` : ""}. Не ваш город?
            </span>
            <span className="flex items-center gap-3 shrink-0">
              <button onClick={() => { setCityPickerOpen(true); dismissCityHint() }} className="font-semibold underline">
                Выбрать
              </button>
              <button onClick={dismissCityHint} aria-label="Закрыть" className="opacity-60">
                <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          </div>
        )}

        {/* ВАЖНО: унифицируем пропсы под isOpen/onClose */}
        <UserProfileSheet
          isOpen={isProfileSheetOpen}
          onClose={() => setIsProfileSheetOpen(false)}
        />
        <CityPickerSheet
          isOpen={cityPickerOpen}
          onClose={() => setCityPickerOpen(false)}
          onPicked={handleCityPicked}
          currentCity={weather?.location}
          currentCountry={weather?.country}
        />
      </>
    )
  }

  return (
    <header className="sticky top-0 z-40">
      {/* Стеклянная подложка — смонтирована всегда (backdrop-filter не анимируется),
          прозрачна наверху страницы, проявляется через opacity после скролла. */}
      <div
        aria-hidden="true"
        className={cn(
          "glass glass-refract absolute inset-0 border-b border-line transition-opacity duration-200 ease-[var(--ease-out)] will-change-transform",
          isScrolled ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="relative flex items-center justify-between px-4 py-3">
        {/* Левая часть — дата (тише заголовка экрана, не дублирует системные часы). */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center gap-2">
            <span className="text-caption text-ink-2">{currentDate}</span>
            {/* Компактная погода на мобильных */}
            {hasTemperature && !weatherLoading && (
              <span className="flex items-center gap-1 sm:hidden text-caption text-ink-2">
                <WeatherIcon condition={weather.condition} className="h-3.5 w-3.5" />
                <span>{weather.temperature}°C</span>
              </span>
            )}
          </div>

          {/* Полная погода на десктопе — тап → выбор города */}
          {hasTemperature && !weatherLoading && (
            <button
              type="button"
              onClick={() => setCityPickerOpen(true)}
              className="hidden sm:flex items-center space-x-2 text-caption text-ink-2 hover:text-ink"
              title="Выбрать город"
            >
              <MapPin className="h-4 w-4" strokeWidth={1.75} />
              <span>{weather.location}</span>
              <WeatherIcon condition={weather.condition} className="h-4 w-4" />
              <span className="font-medium">{weather.temperature}°C</span>
              <span className="capitalize">{weather.description}</span>
            </button>
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
            <Button variant="ghost" size="icon" onClick={handleProfileClick}>
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
      />
      <CityPickerSheet
        isOpen={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        onPicked={handleCityPicked}
        currentCity={weather?.location}
        currentCountry={weather?.country}
      />
    </header>
  )
}
