"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Menu, Shirt, FolderIcon as Hanger, Settings, LogOut, Home, Package } from "lucide-react"
import { signOut } from "@/lib/actions"

interface NavigationProps {
  user: {
    email?: string
    isAdmin?: boolean
  }
}

export function Navigation({ user }: NavigationProps) {
  const pathname = usePathname()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const getUserInitials = (email: string | undefined) => {
    if (!email) return "U"
    return email.charAt(0).toUpperCase()
  }

  const adminNavItems = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/wardrobe", label: "Гардероб", icon: Shirt },
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Package },
    { href: "/admin/outfits", label: "Образы", icon: Hanger },
  ]

  const userNavItems = [
    { href: "/app", label: "Главная", icon: Home },
    { href: "/app/wardrobe", label: "Мой гардероб", icon: Shirt },
  ]

  const navItems = user.isAdmin ? adminNavItems : userNavItems

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Логотип */}
          <Link href={user.isAdmin ? "/admin" : "/app"} className="flex items-center space-x-2">
            <Shirt className="h-6 w-6" />
            <span className="font-bold text-xl" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Mode Morph
            </span>
          </Link>

          {/* Десктопная навигация */}
          <nav className="hidden md:flex items-center space-x-6">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin" && item.href !== "/app" && pathname.startsWith(item.href + "/"))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Пользователь */}
          <div className="flex items-center space-x-4">
            <div className="relative" ref={dropdownRef}>
              <Button
                variant="ghost"
                className="relative h-8 w-8 rounded-full"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-600 text-white text-sm">
                    {getUserInitials(user.email)}
                  </AvatarFallback>
                </Avatar>
              </Button>

              {/* Выпадающее меню */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-[100]">
                  {/* Информация о пользователе */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-600 text-white text-xs">
                        {getUserInitials(user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <p className="font-medium text-sm text-gray-900">{user.email}</p>
                      <p className="text-xs text-gray-500">{user.isAdmin ? "Администратор" : "Пользователь"}</p>
                    </div>
                  </div>

                  {/* Настройки */}
                  <Link
                    href={user.isAdmin ? "/admin/settings" : "/settings"}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Настройки</span>
                  </Link>

                  {/* Разделитель */}
                  <div className="border-t border-gray-100 my-1"></div>

                  {/* Выйти */}
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Выйти</span>
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Мобильное меню */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <nav className="flex flex-col space-y-4 mt-8">
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/admin" && item.href !== "/app" && pathname.startsWith(item.href + "/"))

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}

                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-600 text-white text-xs">
                          {getUserInitials(user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{user.email}</p>
                        <p className="text-xs text-gray-500">{user.isAdmin ? "Администратор" : "Пользователь"}</p>
                      </div>
                    </div>
                    <Link
                      href={user.isAdmin ? "/admin/settings" : "/settings"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100"
                    >
                      <Settings className="h-5 w-5" />
                      Настройки
                    </Link>
                    <form action={signOut} className="w-full">
                      <button
                        type="submit"
                        className="flex w-full items-center gap-3 px-3 py-2 rounded-md hover:bg-red-50 text-red-600 text-left"
                      >
                        <LogOut className="h-5 w-5" />
                        Выйти
                      </button>
                    </form>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
