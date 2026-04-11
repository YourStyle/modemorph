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
  Settings,
  UserCheck,
  Shirt,
  Package,
  Palette,
  Layers,
  Sparkles,
  DollarSign,
  BarChart3,
  Send,
  Bell,
  Building2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        if (!sessionAuth.hasValidSession()) {
          router.replace("/app")
          return
        }

        const accessToken = sessionAuth.getAccessToken()
        if (!accessToken) {
          router.replace("/app")
          return
        }

        const response = await fetchWithRetry(
          "/api/me",
          { headers: { Authorization: `Bearer ${accessToken}` } },
          { timeout: 5000, retries: 1 },
        )

        if (!response.ok) {
          router.replace("/app")
          return
        }

        const data = await response.json()

        if (!data.profile?.is_admin) {
          router.replace("/app")
          return
        }

        setIsAdmin(true)
      } catch (error) {
        console.error("[AdminLayout] Error:", error)
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!isAdmin) return null

  const mainNav = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/users", label: "Пользователи", icon: UserCheck },
    { href: "/admin/analytics", label: "Аналитика", icon: BarChart3 },
    { href: "/admin/partners", label: "Партнёры", icon: Building2 },
  ]

  const clothingNav = [
    { href: "/admin/wardrobe", label: "Гардероб", icon: Package },
    { href: "/admin/outfits", label: "Образы", icon: Palette },
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Layers },
    { href: "/admin/combinations", label: "Комбинации", icon: Sparkles },
  ]

  const systemNav = [
    { href: "/admin/feature-costs", label: "Стоимость", icon: DollarSign },
    { href: "/admin/broadcasts", label: "Рассылки", icon: Send },
    { href: "/admin/reminders", label: "Напоминания", icon: Bell },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href)
  }

  const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive(href)
          ? "bg-gray-900 text-white"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      } ${sidebarCollapsed ? "justify-center" : ""}`}
      title={sidebarCollapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!sidebarCollapsed && <span>{label}</span>}
    </Link>
  )

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`px-4 py-5 border-b border-gray-200 ${sidebarCollapsed && !mobile ? "px-2" : ""}`}>
        <Link href="/admin" className="flex items-center gap-2">
          <div className="h-8 w-8 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          {(!sidebarCollapsed || mobile) && (
            <span className="font-semibold text-gray-900">Админ панель</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {(!sidebarCollapsed || mobile) && (
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Основное</p>
          )}
          {mainNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div className="space-y-1">
          {(!sidebarCollapsed || mobile) && (
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Одежда</p>
          )}
          {clothingNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div className="space-y-1">
          {(!sidebarCollapsed || mobile) && (
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Система</p>
          )}
          {systemNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-200 px-3 py-3 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            sessionAuth.clearSession()
            router.push("/")
          }}
          className={`w-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 ${
            sidebarCollapsed && !mobile ? "justify-center px-0" : "justify-start"
          }`}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {(!sidebarCollapsed || mobile) && <span className="ml-2">Выйти</span>}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-gray-200 fixed top-0 left-0 h-screen z-30 transition-all duration-200 ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        <SidebarContent />
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-8 bg-white border border-gray-200 rounded-full p-1 shadow-sm hover:bg-gray-50"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5 text-gray-500" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5 text-gray-500" />
          )}
        </button>
      </aside>

      {/* Main content area */}
      <div className={`flex-1 transition-all duration-200 ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-60"}`}>
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">M</span>
              </div>
              <span className="font-semibold text-gray-900 text-sm">Админ</span>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SidebarContent mobile />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl">{children}</main>
      </div>
    </div>
  )
}
