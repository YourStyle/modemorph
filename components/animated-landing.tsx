"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useTMA } from "@/hooks/use-tma"

type FanLook = {
  src: string
  alt: string
  x: number
  y: number
  rotate: number
  z: number
  size: string
}

const MOBILE_LOOKS: FanLook[] = [
  { src: "https://storage.yandexcloud.net/modemorphs3/static/1_woman.png", alt: "Стильный женский образ", x: -75, y: 15, rotate: -20, z: 10, size: "w-28 h-40" },
  { src: "https://storage.yandexcloud.net/modemorphs3/static/2_woman.png", alt: "Элегантный женский образ", x: 0, y: 0, rotate: 0, z: 30, size: "w-32 h-44" },
  { src: "https://storage.yandexcloud.net/modemorphs3/static/3_woman.png", alt: "Модный женский образ", x: 75, y: 15, rotate: 20, z: 10, size: "w-28 h-40" },
]

const DESKTOP_LOOKS: FanLook[] = [
  { src: "https://storage.yandexcloud.net/modemorphs3/static/1_woman.png", alt: "Стильный женский образ 1", x: -280, y: 70, rotate: -25, z: 10, size: "w-52 h-72" },
  { src: "https://storage.yandexcloud.net/modemorphs3/static/2_woman.png", alt: "Элегантный женский образ 2", x: -140, y: 20, rotate: -12, z: 20, size: "w-52 h-72" },
  { src: "https://storage.yandexcloud.net/modemorphs3/static/3_woman.png", alt: "Модный женский образ 3", x: 0, y: 0, rotate: 0, z: 30, size: "w-52 h-72" },
  { src: "https://storage.yandexcloud.net/modemorphs3/static/4_woman.png", alt: "Трендовый женский образ 4", x: 140, y: 20, rotate: 12, z: 20, size: "w-52 h-72" },
  { src: "https://storage.yandexcloud.net/modemorphs3/static/5_woman.png", alt: "Современный женский образ 5", x: 280, y: 70, rotate: 25, z: 10, size: "w-52 h-72" },
]

export function AnimatedLanding() {
  const { isTMA, isLoading } = useTMA()

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Навигация */}
      <nav className="flex justify-end p-4 lg:p-6 animate-fade-in-down">
        <div className="flex items-center gap-2">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">
              Войти
            </Button>
          </Link>
          {!isLoading && !isTMA && (
            <Link href="/auth/sign-up">
              <Button variant="default" size="sm">
                Регистрация
              </Button>
            </Link>
          )}
        </div>
      </nav>

      {/* Основной контент */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 lg:px-12">
        <div className="max-w-md lg:max-w-7xl w-full text-center space-y-6 lg:space-y-12">
          {/* Заголовок */}
          <div className="space-y-3 lg:space-y-5">
            <h1 className="text-display lg:text-[64px] lg:leading-[68px] text-ink animate-fade-in-up animation-delay-100">
              Mode Morph
            </h1>
            <p className="text-body lg:text-[19px] lg:leading-[28px] text-ink-2 max-w-[300px] lg:max-w-2xl mx-auto animate-fade-in-up animation-delay-200">
              Создавайте стильные образы за секунды с помощью умного анализа вашего гардероба.
              Mode Morph поможет найти идеальные сочетания для любого случая.
            </p>
          </div>

          {/* Карточки с фотографиями в веерном стиле */}
          <div className="relative py-4 lg:py-20 animate-fade-in-up animation-delay-300">
            {/* Мобильная версия — 3 карточки веером */}
            <div className="block lg:hidden overflow-hidden">
              <div className="relative w-full h-72 mx-auto flex items-center justify-center">
                {MOBILE_LOOKS.map((look) => (
                  <div
                    key={look.alt}
                    className={`absolute ${look.size} rounded-2xl overflow-hidden bg-surface shadow-lg transition-transform duration-300 ease-out`}
                    style={{
                      transform: `translateX(${look.x}px) translateY(${look.y}px) rotate(${look.rotate}deg)`,
                      zIndex: look.z,
                    }}
                  >
                    <img src={look.src} alt={look.alt} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>

            {/* Десктопная версия — 5 карточек веером */}
            <div className="hidden lg:block">
              <div className="relative w-full h-[32rem] mx-auto flex items-center justify-center">
                {DESKTOP_LOOKS.map((look) => (
                  <div
                    key={look.alt}
                    className={`absolute ${look.size} rounded-2xl overflow-hidden bg-surface shadow-lg transition-transform duration-300 ease-out hover:-translate-y-2`}
                    style={{
                      transform: `translateX(${look.x}px) translateY(${look.y}px) rotate(${look.rotate}deg)`,
                      zIndex: look.z,
                    }}
                  >
                    <img src={look.src} alt={look.alt} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Основная кнопка */}
          <div className="pt-2 lg:pt-8 animate-fade-in-up animation-delay-400">
            <Link href="/auth/sign-up" className="block lg:inline-block">
              <Button variant="signal" size="lg" className="w-full lg:w-auto lg:px-16">
                Попробовать
                <ArrowRight strokeWidth={2} />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Нижний индикатор (как на iPhone) */}
      <div className="flex justify-center pb-2 lg:hidden animate-fade-in animation-delay-500">
        <div className="w-32 h-1 bg-ink/20 rounded-full" />
      </div>

      {/* CSS-анимации появления. Только transform/opacity — совместимо с
          prefers-reduced-motion (глобальное правило уже есть в globals.css). */}
      <style jsx>{`
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translate3d(0, -12px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translate3d(0, 16px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .animate-fade-in-down {
          animation: fadeInDown 0.5s var(--ease-out, ease-out) both;
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.55s var(--ease-out, ease-out) both;
        }

        .animate-fade-in {
          animation: fadeIn 0.5s var(--ease-out, ease-out) both;
        }

        .animation-delay-100 {
          animation-delay: 0.1s;
        }

        .animation-delay-200 {
          animation-delay: 0.2s;
        }

        .animation-delay-300 {
          animation-delay: 0.3s;
        }

        .animation-delay-400 {
          animation-delay: 0.4s;
        }

        .animation-delay-500 {
          animation-delay: 0.5s;
        }
      `}</style>
    </div>
  )
}
