"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"

export function AnimatedLanding() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Навигация */}
      <nav className="flex justify-end p-4 lg:p-6 animate-fade-in-down">
        <div className="flex gap-2">
          <Link href="/auth/login">
            <Button variant="ghost" className="text-gray-600 hover:text-gray-900">
              Войти
            </Button>
          </Link>
          <Link href="/auth/sign-up">
            <Button className="bg-gray-900 hover:bg-gray-800 text-white">Регистрация</Button>
          </Link>
        </div>
      </nav>

      {/* Основной контент */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 lg:px-12">
        <div className="max-w-md lg:max-w-7xl w-full text-center space-y-8 lg:space-y-12">
          {/* Заголовок с анимацией */}
          <div className="space-y-4 lg:space-y-6">
            <h1
              className="text-4xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-tight animate-fade-in-up animation-delay-200"
              style={{ fontFamily: "Montserrat, sans-serif" }}
            >
              Mode Morph
            </h1>

            {/* Описание с анимацией */}
            <p className="text-base lg:text-xl text-gray-600 leading-relaxed max-w-lg lg:max-w-2xl mx-auto animate-fade-in-up animation-delay-400">
              Создавайте стильные образы за секунды с помощью умного анализа вашего гардероба. Mode Morph поможет найти
              идеальные сочетания для любого случая.
            </p>
          </div>

          {/* Карточки с фотографиями в веерном стиле */}
          <div className="relative py-12 lg:py-20 animate-fade-in-up animation-delay-800">
            {/* Мобильная версия - 3 карточки веером */}
            <div className="block lg:hidden">
              <div className="relative w-full h-96 mx-auto flex items-center justify-center">
                {/* Левая карточка - 1_woman */}
                <div className="absolute group cursor-pointer">
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-44 h-64 z-0"
                    style={{ transform: "translateX(-120px) translateY(60px) rotate(-20deg)" }}
                  ></div>
                  <div
                    className="relative w-44 h-64 rounded-3xl overflow-hidden shadow-xl z-10 transition-all duration-300 group-hover:scale-105"
                    style={{ transform: "translateX(-140px) translateY(20px) rotate(-20deg)" }}
                  >
                    <img
                      src="/images/1_woman.png"
                      alt="Стильный женский образ"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Центральная карточка - 2_woman */}
                <div className="absolute group cursor-pointer">
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-48 h-68 z-0"></div>
                  <div className="relative w-48 h-68 rounded-3xl overflow-hidden shadow-xl z-30 transition-all duration-300 group-hover:scale-105">
                    <img
                      src="/images/2_woman.png"
                      alt="Элегантный женский образ"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Правая карточка - 3_woman */}
                <div className="absolute group cursor-pointer">
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-44 h-64 z-0"
                    style={{ transform: "translateX(120px) translateY(60px) rotate(20deg)" }}
                  ></div>
                  <div
                    className="relative w-44 h-64 rounded-3xl overflow-hidden shadow-xl z-10 transition-all duration-300 group-hover:scale-105"
                    style={{ transform: "translateX(140px) translateY(20px) rotate(20deg)" }}
                  >
                    <img src="/images/3_woman.png" alt="Модный женский образ" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            </div>

            {/* ДЕСКТОПНАЯ ВЕРСИЯ - 5 КАРТОЧЕК ВЕЕРОМ */}
            <div className="hidden lg:block">
              <div className="relative w-full h-[32rem] mx-auto flex items-center justify-center">
                {/* 1. КРАЙНЯЯ ЛЕВАЯ КАРТОЧКА */}
                <div
                  className="absolute group cursor-pointer z-10"
                  style={{ transform: "translateX(-280px) translateY(70px) rotate(-25deg)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-52 h-72"></div>
                  <div className="relative w-52 h-72 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-105 bg-white z-10">
                    <img
                      src="/images/1_woman.png"
                      alt="Стильный женский образ 1"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* 2. ЛЕВАЯ КАРТОЧКА */}
                <div
                  className="absolute group cursor-pointer z-20"
                  style={{ transform: "translateX(-140px) translateY(20px) rotate(-12deg)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-52 h-72"></div>
                  <div className="relative w-52 h-72 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-105 bg-white z-20">
                    <img
                      src="/images/2_woman.png"
                      alt="Элегантный женский образ 2"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* 3. ЦЕНТРАЛЬНАЯ КАРТОЧКА */}
                <div
                  className="absolute group cursor-pointer z-30"
                  style={{ transform: "translateX(0px) translateY(0px) rotate(0deg)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-52 h-72"></div>
                  <div className="relative w-52 h-72 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-105 bg-white z-30">
                    <img
                      src="/images/3_woman.png"
                      alt="Модный женский образ 3"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* 4. ПРАВАЯ КАРТОЧКА */}
                <div
                  className="absolute group cursor-pointer z-20"
                  style={{ transform: "translateX(140px) translateY(20px) rotate(12deg)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-52 h-72"></div>
                  <div className="relative w-52 h-72 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-105 bg-white z-20">
                    <img
                      src="/images/4_woman.png"
                      alt="Трендовый женский образ 4"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* 5. КРАЙНЯЯ ПРАВАЯ КАРТОЧКА */}
                <div
                  className="absolute group cursor-pointer z-10"
                  style={{ transform: "translateX(280px) translateY(70px) rotate(25deg)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-400 via-purple-500 via-blue-500 via-green-400 via-yellow-400 to-red-400 rounded-3xl opacity-0 group-hover:opacity-30 blur-lg transition-all duration-500 w-52 h-72"></div>
                  <div className="relative w-52 h-72 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-105 bg-white z-10">
                    <img
                      src="/images/5_woman.png"
                      alt="Современный женский образ 5"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Профессиональная кнопка с анимацией */}
          <div className="pt-4 lg:pt-8 animate-fade-in-up animation-delay-1400">
            <Link href="/auth/sign-up">
              <Button
                size="lg"
                className="
                  w-full lg:w-auto lg:px-16 
                  bg-gray-900 hover:bg-gray-800 
                  text-white font-medium text-base
                  py-4 lg:py-5
                  rounded-xl
                  shadow-sm hover:shadow-md
                  transition-all duration-200
                  border border-gray-900
                  focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
                "
              >
                Попробовать
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Нижний индикатор (как на iPhone) */}
      <div className="flex justify-center pb-2 lg:hidden animate-fade-in animation-delay-1600">
        <div className="w-32 h-1 bg-black rounded-full"></div>
      </div>

      {/* CSS анимации */}
      <style jsx>{`
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translate3d(0, -100%, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translate3d(0, 100%, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translate3d(-100%, 0, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translate3d(100%, 0, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translate3d(0, 100%, 0);
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
          animation: fadeInDown 0.8s ease-out;
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out;
          animation-fill-mode: both;
        }

        .animate-slide-in-left {
          animation: slideInLeft 0.8s ease-out;
          animation-fill-mode: both;
        }

        .animate-slide-in-right {
          animation: slideInRight 0.8s ease-out;
          animation-fill-mode: both;
        }

        .animate-slide-in-up {
          animation: slideInUp 0.8s ease-out;
          animation-fill-mode: both;
        }

        .animate-fade-in {
          animation: fadeIn 0.8s ease-out;
          animation-fill-mode: both;
        }

        .animation-delay-200 {
          animation-delay: 0.2s;
        }

        .animation-delay-400 {
          animation-delay: 0.4s;
        }

        .animation-delay-600 {
          animation-delay: 0.6s;
        }

        .animation-delay-800 {
          animation-delay: 0.8s;
        }

        .animation-delay-900 {
          animation-delay: 0.9s;
        }

        .animation-delay-1000 {
          animation-delay: 1.0s;
        }

        .animation-delay-1100 {
          animation-delay: 1.1s;
        }

        .animation-delay-1200 {
          animation-delay: 1.2s;
        }

        .animation-delay-1400 {
          animation-delay: 1.4s;
        }

        .animation-delay-1600 {
          animation-delay: 1.6s;
        }
      `}</style>
    </div>
  )
}
