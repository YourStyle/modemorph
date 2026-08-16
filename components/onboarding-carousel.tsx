"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Shirt, Sparkles, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"

const onboardingSlides = [
  {
    title: "Умный гардероб",
    subtitle: "Соберите одежду в цифровом виде и всегда помните, что у вас есть",
    Icon: Shirt,
  },
  {
    title: "Идеальные образы",
    subtitle: "Получайте подборки нарядов под погоду и мероприятие",
    Icon: Sparkles,
  },
  {
    title: "Аналитика стиля",
    subtitle: "Следите за предпочтениями и открывайте новые сочетания",
    Icon: BarChart3,
  },
]

interface OnboardingCarouselProps {
  compact?: boolean
}

export function OnboardingCarousel({ compact = false }: OnboardingCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    // Компактная лента живёт над формой входа — автопрокрутка там только
    // отвлекает от полей. На весь экран (десктоп) карусель — единственный
    // контент слева, там автоплей уместен.
    if (compact) return
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % onboardingSlides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [compact])

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % onboardingSlides.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + onboardingSlides.length) % onboardingSlides.length)
  }

  return (
    <div
      className={`relative overflow-hidden bg-canvas-sunk ${compact ? "h-60" : "h-full"}`}
    >
      {/* Navigation arrows for desktop */}
      {!compact && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 text-ink hover:bg-canvas"
            onClick={prevSlide}
            aria-label="Предыдущий слайд"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-ink hover:bg-canvas"
            onClick={nextSlide}
            aria-label="Следующий слайд"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </>
      )}

      {/* Track — slides on transform only, никаких прыжков высоты */}
      <div
        className="flex h-full ease-out"
        style={{
          width: `${onboardingSlides.length * 100}%`,
          transform: `translateX(-${(100 / onboardingSlides.length) * currentSlide}%)`,
          transitionProperty: "transform",
          transitionDuration: "var(--dur-sheet)",
          transitionTimingFunction: "var(--ease-out)",
        }}
      >
        {onboardingSlides.map(({ title, subtitle, Icon }, index) => (
          <div
            key={index}
            className="flex h-full flex-col items-center justify-center px-8 text-center"
            style={{ width: `${100 / onboardingSlides.length}%` }}
            aria-hidden={index !== currentSlide}
          >
            <div
              className={`flex items-center justify-center rounded-full bg-canvas text-ink ${
                compact ? "mb-4 h-14 w-14" : "mb-6 h-20 w-20"
              }`}
            >
              <Icon className={compact ? "h-6 w-6" : "h-9 w-9"} strokeWidth={1.75} />
            </div>

            <h2 className={compact ? "text-h2 text-ink" : "text-display text-ink"}>{title}</h2>
            <p className={`mt-2 max-w-[280px] text-ink-2 ${compact ? "text-caption" : "text-body"}`}>
              {subtitle}
            </p>
          </div>
        ))}
      </div>

      {/* Pagination dots — реальные переключатели слайдов, поэтому у каждого есть
          скрытая зона касания 44x44 (-m-[19px] вокруг видимой точки 6px = ровно
          44px, точка на глаз не меняется). Цвет и transform точки — без анимации
          width/height. */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
        {onboardingSlides.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Слайд ${index + 1}`}
            aria-current={index === currentSlide}
            className="-m-[19px] flex h-11 w-11 items-center justify-center"
            onClick={() => setCurrentSlide(index)}
          >
            <span
              className={`block h-1.5 w-1.5 rounded-full transition-[transform,background-color] duration-press ease-out ${
                index === currentSlide ? "scale-125 bg-signal" : "scale-100 bg-line"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
