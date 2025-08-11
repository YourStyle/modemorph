"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const onboardingSlides = [
  {
    title: "Умный гардероб",
    subtitle: "Организуйте свою одежду в цифровом ��иде и никогда не забывайте, что у вас есть",
    image: "/placeholder.svg?height=300&width=300&text=Smart+Wardrobe",
    icon: "👗",
  },
  {
    title: "Идеальные образы",
    subtitle: "Получайте рекомендации нарядов на основе погоды и мероприятий",
    image: "/placeholder.svg?height=300&width=300&text=Perfect+Outfits",
    icon: "✨",
  },
  {
    title: "Аналитика стиля",
    subtitle: "Отслеживайте свои предпочтения в стиле и открывайте новые сочетания",
    image: "/placeholder.svg?height=300&width=300&text=Style+Analytics",
    icon: "📊",
  },
]

interface OnboardingCarouselProps {
  compact?: boolean
}

export function OnboardingCarousel({ compact = false }: OnboardingCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % onboardingSlides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % onboardingSlides.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + onboardingSlides.length) % onboardingSlides.length)
  }

  const currentSlideData = onboardingSlides[currentSlide]

  return (
    <div className={`relative overflow-hidden bg-gray-50 ${compact ? "h-80" : "h-full"}`}>
      <div className="h-full flex flex-col items-center justify-center p-8 text-gray-900 transition-all duration-500">
        {/* Navigation arrows for desktop */}
        {!compact && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 hover:bg-gray-200 z-10"
              onClick={prevSlide}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:bg-gray-200 z-10"
              onClick={nextSlide}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Content */}
        <div className="text-center max-w-md mx-auto">
          <div className={`mb-8 ${compact ? "h-32" : "h-64"} flex flex-col items-center justify-center`}>
            <div className={`${compact ? "text-4xl mb-4" : "text-6xl mb-6"}`}>{currentSlideData.icon}</div>
            <img
              src={currentSlideData.image || "/placeholder.svg"}
              alt={currentSlideData.title}
              className={`${compact ? "h-16 w-16" : "h-32 w-32"} object-contain opacity-20 rounded-2xl`}
            />
          </div>

          <h2 className={`font-bold mb-4 text-gray-900 ${compact ? "text-2xl" : "text-4xl"}`}>
            {currentSlideData.title}
          </h2>

          <p className={`text-gray-600 leading-relaxed ${compact ? "text-sm" : "text-lg"}`}>
            {currentSlideData.subtitle}
          </p>
        </div>

        {/* Pagination dots */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex space-x-2">
          {onboardingSlides.map((_, index) => (
            <button
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide ? "bg-gray-900 w-6" : "bg-gray-400 w-2"
              }`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
