"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Cloud, Sun, CloudRain, CloudSnowIcon as Snow } from "lucide-react"

export function TopNavigation() {
  const currentDate = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const currentTime = new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })

  // Мок данные погоды
  const weather = {
    temp: 22,
    condition: "sunny",
    description: "Солнечно",
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

  return (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between">
        {/* Левая часть - Дата и время */}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{currentDate}</h1>
          <div className="flex items-center space-x-2 sm:space-x-4 mt-1">
            <p className="text-sm sm:text-lg text-gray-600">{currentTime}</p>

            {/* Погода */}
            <div className="flex items-center space-x-1 sm:space-x-2">
              {getWeatherIcon(weather.condition)}
              <span className="text-sm sm:text-base text-gray-700">{weather.temp}°</span>
              {/* Описание погоды только на больших экранах */}
              <span className="hidden sm:inline text-sm text-gray-600">{weather.description}</span>
            </div>
          </div>
        </div>

        {/* Правая часть - Аватар */}
        <div className="flex-shrink-0 ml-4">
          <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
            <AvatarImage src="/placeholder-user.jpg" alt="User" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  )
}
