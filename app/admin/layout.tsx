"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { sessionAuth } from "@/lib/tma/session-auth"
import { fetchWithRetry } from "@/lib/fetch-with-retry"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Menu,
  Home,
  Settings,
  UserCheck,
  ChevronDown,
  Shirt,
  Package,
  Palette,
  Layers,
  Sparkles,
  DollarSign,
  BarChart3,
  Send,
  Bell,
} from "lucide-react"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // Проверяем сессию
        if (!sessionAuth.hasValidSession()) {
          console.log("[AdminLayout] No valid session, redirecting to /app")
          router.replace("/app")
          return
        }

        const accessToken = sessionAuth.getAccessToken()
        if (!accessToken) {
          console.log("[AdminLayout] No access token, redirecting to /app")
          router.replace("/app")
          return
        }

        // Проверяем is_admin
        const response = await fetchWithRetry(
          "/api/me",
          {
            headers: { "Authorization": `Bearer ${accessToken}` }
          },
          { timeout: 5000, retries: 1 }
        )

        if (!response.ok) {
          console.log("[AdminLayout] API error, redirecting to /app")
          router.replace("/app")
          return
        }

        const data = await response.json()
        console.log("[AdminLayout] User data:", data)

        if (!data.profile?.is_admin) {
          console.log("[AdminLayout] User is not admin, redirecting to /app")
          router.replace("/app")
          return
        }

        console.log("[AdminLayout] User is admin, allowing access")
        setIsAdmin(true)
      } catch (error) {
        console.error("[AdminLayout] Error checking admin access:", error)
        router.replace("/app")
      } finally {
        setIsLoading(false)
      }
    }

    checkAdminAccess()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null // Редирект уже произошел
  }

  const navigationItems = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/users", label: "Пользователи", icon: UserCheck },
    { href: "/admin/analytics", label: "Аналитика", icon: BarChart3 },
    { href: "/admin/feature-costs", label: "Стоимость", icon: DollarSign },
    { href: "/admin/broadcasts", label: "Рассылки", icon: Send },
    { href: "/admin/reminders", label: "Напоминания", icon: Bell },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  const clothingItems = [
    { href: "/admin/wardrobe", label: "Гардероб", icon: Package },
    { href: "/admin/outfits", label: "Образы", icon: Palette },
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Layers },
    { href: "/admin/combinations", label: "Комбинации", icon: Sparkles },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                Админ панель
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex ml-8 space-x-1 items-center">
                {navigationItems.map((item) => {
                  const IconComponent = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200"
                    >
                      <IconComponent className="h-4 w-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200"
                    >
                      <Shirt className="h-4 w-4" />
                      <span>Одежда</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-56 bg-white/95 backdrop-blur-sm border border-gray-200/50 shadow-lg"
                  >
                    {clothingItems.map((item) => {
                      const IconComponent = item.icon
                      return (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link
                            href={item.href}
                            className="flex items-center space-x-3 w-full px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 transition-all duration-200"
                          >
                            <IconComponent className="h-4 w-4 text-purple-600" />
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <Link href="/app" className="hidden sm:block">
                <Button variant="outline" size="sm">
                  В приложение
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  sessionAuth.clearSession()
                  router.push("/")
                }}
                className="hidden sm:block"
              >
                Выйти
              </Button>

              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="sm">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                  <div className="flex flex-col space-y-4 mt-6">
                    <nav className="flex flex-col space-y-1">
                      {navigationItems.map((item) => {
                        const IconComponent = item.icon
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center space-x-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3 py-3 rounded-md text-base font-medium transition-all duration-200"
                          >
                            <IconComponent className="h-5 w-5 flex-shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}

                      <div className="px-3 py-2">
                        <div className="flex items-center space-x-3 text-gray-700 font-medium mb-2">
                          <Shirt className="h-5 w-5" />
                          <span>Одежда</span>
                        </div>
                        <div className="ml-8 space-y-1">
                          {clothingItems.map((item) => {
                            const IconComponent = item.icon
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="flex items-center space-x-3 text-gray-600 hover:text-gray-900 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 px-3 py-2 rounded-md text-sm transition-all duration-200"
                              >
                                <IconComponent className="h-4 w-4 text-purple-600" />
                                <span>{item.label}</span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </nav>

                    <div className="pt-4 border-t space-y-2">
                      <Link href="/app" className="block">
                        <Button variant="outline" size="sm" className="w-full bg-transparent">
                          В приложение
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          sessionAuth.clearSession()
                          router.push("/")
                        }}
                        className="w-full"
                      >
                        Выйти
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
