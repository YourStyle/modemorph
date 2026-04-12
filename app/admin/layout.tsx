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
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        if (!sessionAuth.hasValidSession() || !sessionAuth.getAccessToken()) {
          router.replace("/auth/login")
          return
        }

        const res = await fetchWithRetry(
          "/api/me",
          { headers: { Authorization: `Bearer ${sessionAuth.getAccessToken()}` } },
          { timeout: 5000, retries: 1 },
        )

        if (!res.ok) { router.replace("/auth/login"); return }
        const data = await res.json()
        if (!data.profile?.is_admin) { router.replace("/auth/login"); return }
        setIsAdmin(true)
      } catch {
        router.replace("/auth/login")
      } finally {
        setIsLoading(false)
      }
    }
    check()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="animate-spin rounded-full h-7 w-7 border-2 border-white/20 border-t-white" />
      </div>
    )
  }

  if (!isAdmin) return null

  const nav = [
    { group: "Управление", items: [
      { href: "/admin", label: "Обзор", icon: Home },
      { href: "/admin/users", label: "Пользователи", icon: UserCheck },
      { href: "/admin/analytics", label: "Аналитика", icon: BarChart3 },
      { href: "/admin/partners", label: "Партнёры", icon: Building2 },
    ]},
    { group: "Каталог", items: [
      { href: "/admin/wardrobe", label: "Гардероб", icon: Package },
      { href: "/admin/outfits", label: "Образы", icon: Palette },
      { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Layers },
      { href: "/admin/combinations", label: "Комбинации", icon: Sparkles },
    ]},
    { group: "Настройки", items: [
      { href: "/admin/feature-costs", label: "Тарификация", icon: DollarSign },
      { href: "/admin/broadcasts", label: "Рассылки", icon: Send },
      { href: "/admin/reminders", label: "Напоминания", icon: Bell },
      { href: "/admin/settings", label: "Настройки", icon: Settings },
    ]},
  ]

  const active = (href: string) => href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const on = active(href)
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`group flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150 ${
          on
            ? "bg-white/10 text-white"
            : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"
        } ${collapsed ? "justify-center px-2" : ""}`}
      >
        <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${on ? "text-white" : "text-white/40 group-hover:text-white/70"}`} />
        {!collapsed && <span>{label}</span>}
      </Link>
    )
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => {
    const show = !collapsed || mobile
    return (
      <div className="flex flex-col h-full bg-[#0f1117]">
        {/* Brand */}
        <div className={`flex items-center h-14 border-b border-white/[0.06] ${show ? "px-5" : "px-0 justify-center"}`}>
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">M</span>
            </div>
            {show && <span className="font-semibold text-white text-sm tracking-tight">ModeMorph</span>}
          </Link>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-5">
          {nav.map((group) => (
            <div key={group.group} className={show ? "px-3" : "px-1.5"}>
              {show && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/25">
                  {group.group}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => <NavItem key={item.href} {...item} />)}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/[0.06] py-3 ${show ? "px-4" : "px-1.5"}`}>
          <button
            onClick={() => { sessionAuth.clearSession(); router.push("/auth/login") }}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors ${collapsed && !mobile ? "justify-center px-2" : ""}`}
          >
            <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
            {show && <span>Выйти</span>}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 transition-all duration-200 ${collapsed ? "w-[56px]" : "w-[220px]"}`}>
        <Sidebar />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[18px] h-6 w-6 bg-[#0f1117] border-2 border-[#f8f9fb] rounded-full flex items-center justify-center hover:bg-[#1a1d27] transition-colors"
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3 text-white/60" />
            : <ChevronLeft className="h-3 w-3 text-white/60" />
          }
        </button>
      </aside>

      {/* Content */}
      <div className={`flex-1 min-w-0 transition-all duration-200 ${collapsed ? "lg:pl-[56px]" : "lg:pl-[220px]"}`}>
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 h-14 bg-[#0f1117] flex items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">M</span>
            </div>
            <span className="font-semibold text-white text-sm">ModeMorph</span>
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0 border-0 bg-[#0f1117]">
              <Sidebar mobile />
            </SheetContent>
          </Sheet>
        </header>

        <main className="p-5 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
