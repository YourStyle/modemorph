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
    <div className="min-h-screen bg-canvas">
      {/* Mobile layout — до 500px */}
      <div className="min-[500px]:hidden">
        <div className="relative">
          {showBackButton && (
            <div className="absolute left-2 top-2 z-10">
              <Button variant="ghost" size="icon" className="bg-canvas/60" asChild>
                <Link href="/" aria-label="Назад">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          )}
          <OnboardingCarousel compact />
        </div>

        {/* Форма авторизации снизу */}
        <div className="animate-fade-up px-4 py-6">{children}</div>
      </div>

      {/* Desktop/Tablet layout — от 500px */}
      <div className="hidden h-screen min-[500px]:flex">
        {/* Левая сторона — онбординг на всю высоту */}
        <div className="relative flex-1">
          {showBackButton && (
            <div className="absolute left-4 top-4 z-10">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/" aria-label="Назад">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          )}
          <OnboardingCarousel />
        </div>

        {/* Правая сторона — форма авторизации */}
        <div className="flex flex-1 items-center justify-center border-l border-line bg-surface p-8">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </div>
      </div>
    </div>
  )
}
