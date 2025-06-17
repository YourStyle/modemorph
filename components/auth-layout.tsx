"use client"

import type React from "react"
import { OnboardingCarousel } from "./onboarding-carousel"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface AuthLayoutProps {
  children: React.ReactNode
  showBackButton?: boolean
}

export function AuthLayout({ children, showBackButton = false }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Mobile Layout - до 500px */}
      <div className="block [500px]:hidden">
        {showBackButton && (
          <div className="absolute top-4 left-4 z-10">
            <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100" asChild>
              <Link href="/">
                <ArrowLeft className="h-6 w-6" />
              </Link>
            </Button>
          </div>
        )}

        {/* Компактный онбординг сверху */}
        <OnboardingCarousel compact />

        {/* Форма авторизации снизу */}
        <div className="px-6 py-8 bg-white">{children}</div>
      </div>

      {/* Desktop/Tablet Layout - от 500px */}
      <div className="hidden [500px]:flex h-screen">
        {/* Левая сторона - Онбординг на всю высоту */}
        <div className="flex-1 relative">
          {showBackButton && (
            <div className="absolute top-6 left-6 z-10">
              <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-200" asChild>
                <Link href="/">
                  <ArrowLeft className="h-6 w-6" />
                </Link>
              </Button>
            </div>
          )}
          <OnboardingCarousel />
        </div>

        {/* Правая сторона - Форма авторизации */}
        <div className="flex-1 flex items-center justify-center bg-white p-8 border-l border-gray-100">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  )
}
