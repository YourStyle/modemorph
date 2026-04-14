"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { sessionAuth } from "@/lib/tma/session-auth"
import { fetchWithRetry } from "@/lib/fetch-with-retry"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  Menu,
  Home,
  Key,
  FileUp,
  BarChart3,
  LogOut,
  Clock,
  XCircle,
  ShieldCheck,
  Building2,
} from "lucide-react"
import type { PartnerProfile } from "@/lib/partner-auth"

// Pages accessible without approved status
const PUBLIC_PATHS = ["/partner/login", "/partner/register"]

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [partner, setPartner] = useState<PartnerProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isPublicPage = PUBLIC_PATHS.includes(pathname)

  useEffect(() => {
    if (isPublicPage) {
      setIsLoading(false)
      return
    }

    const checkAccess = async () => {
      try {
        if (!sessionAuth.hasValidSession()) {
          router.replace("/partner/login")
          return
        }

        const accessToken = sessionAuth.getAccessToken()
        if (!accessToken) {
          router.replace("/partner/login")
          return
        }

        const response = await fetchWithRetry(
          "/api/partner/me",
          { headers: { Authorization: `Bearer ${accessToken}` } },
          { timeout: 5000, retries: 1 },
        )

        if (response.status === 404) {
          // Not a partner — redirect to register
          router.replace("/partner/register")
          return
        }

        if (!response.ok) {
          router.replace("/partner/login")
          return
        }

        const data = await response.json()
        setPartner(data.partner)
      } catch (error) {
        console.error("[PartnerLayout] Error:", error)
        router.replace("/partner/login")
      } finally {
        setIsLoading(false)
      }
    }

    checkAccess()
  }, [router, pathname, isPublicPage])

  // Public pages (login/register) render without layout chrome
  if (isPublicPage) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-100 border-t-[#EC9DE2]" />
      </div>
    )
  }

  // Show status screens for non-approved partners
  if (partner && partner.status !== "approved") {
    return <PartnerStatusScreen status={partner.status} reason={partner.rejected_reason} />
  }

  if (!partner) return null

  const navigationItems = [
    { href: "/partner", label: "Дашборд", icon: Home },
    { href: "/partner/tokens", label: "API токены", icon: Key },
    { href: "/partner/feeds", label: "XML фиды", icon: FileUp },
    { href: "/partner/stats", label: "Статистика", icon: BarChart3 },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/partner" className="flex items-center gap-2.5 text-xl font-bold text-gray-900">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#EC9DE2] to-[#89AEFF] flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <span className="tracking-tight">Партнёр</span>
              </Link>

              <nav className="hidden md:flex ml-8 space-x-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-purple-50 text-purple-700"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-[#EC9DE2]" : ""}`} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <span className="hidden sm:block text-sm text-gray-500">{partner.company_name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  sessionAuth.clearSession()
                  router.push("/partner/login")
                }}
                className="hidden sm:flex items-center gap-1 text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </Button>

              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="sm">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px]">
                  <div className="flex flex-col space-y-4 mt-6">
                    <div className="px-3 py-2 text-sm font-medium text-gray-500">
                      {partner.company_name}
                    </div>
                    <nav className="flex flex-col space-y-1">
                      {navigationItems.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center space-x-3 px-3 py-3 rounded-xl text-base font-medium transition-colors ${
                              isActive
                                ? "bg-purple-50 text-purple-700"
                                : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                            }`}
                          >
                            <Icon className={`h-5 w-5 ${isActive ? "text-[#EC9DE2]" : ""}`} />
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}
                    </nav>
                    <div className="pt-4 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          sessionAuth.clearSession()
                          router.push("/partner/login")
                        }}
                        className="w-full justify-start"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
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

function PartnerStatusScreen({ status, reason }: { status: string; reason: string | null }) {
  const router = useRouter()

  const config = {
    pending: {
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      title: "Заявка на рассмотрении",
      description: "Ваша заявка на партнёрство отправлена и ожидает одобрения администратором. Мы уведомим вас по электронной почте.",
    },
    rejected: {
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      title: "Заявка отклонена",
      description: reason || "К сожалению, ваша заявка была отклонена.",
    },
    suspended: {
      icon: ShieldCheck,
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-200",
      title: "Аккаунт приостановлен",
      description: "Ваш партнёрский аккаунт временно приостановлен. Свяжитесь с поддержкой для уточнения.",
    },
  }[status] ?? {
    icon: Clock,
    color: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
    title: "Статус неизвестен",
    description: "Пожалуйста, свяжитесь с поддержкой.",
  }

  const Icon = config.icon

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className={`max-w-md w-full ${config.bg} ${config.border} border rounded-2xl p-8 text-center`}>
        <Icon className={`h-16 w-16 ${config.color} mx-auto mb-4`} />
        <h1 className="text-xl font-bold text-gray-900 mb-2">{config.title}</h1>
        <p className="text-gray-600 mb-6">{config.description}</p>
        <Button
          variant="outline"
          onClick={() => {
            sessionAuth.clearSession()
            router.push("/partner/login")
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Выйти
        </Button>
      </div>
    </div>
  )
}
