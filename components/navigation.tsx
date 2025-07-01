"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Home, Shirt, Settings, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface UserProfile {
  email: string | null
  isAdmin: boolean
}

export function Navigation() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()

        if (!authUser) {
          setUser(null)
          return
        }

        // Получаем профиль пользователя
        const response = await fetch("/api/user-profile")

        if (response.ok) {
          const contentType = response.headers.get("content-type")
          if (contentType && contentType.includes("application/json")) {
            const profile = await response.json()
            setUser({
              email: authUser.email,
              isAdmin: profile.is_admin || false,
            })
          } else {
            // Fallback если профиль не найден
            setUser({
              email: authUser.email,
              isAdmin: false,
            })
          }
        } else {
          // Fallback если API недоступен
          setUser({
            email: authUser.email,
            isAdmin: false,
          })
        }
      } catch (error) {
        console.error("Error fetching user profile:", error)
        // Fallback на базовую информацию
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()

        if (authUser) {
          setUser({
            email: authUser.email,
            isAdmin: false,
          })
        }
      } finally {
        setLoading(false)
      }
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null)
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        getUser()
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  if (loading) {
    return (
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="h-8 w-32 bg-gray-200 animate-pulse rounded" />
            </div>
            <div className="flex items-center space-x-4">
              <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      </nav>
    )
  }

  if (!user) {
    return (
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900">
                Wardrobe AI
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth/login">
                <Button variant="outline">Войти</Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button>Регистрация</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  const adminNavItems = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/wardrobe", label: "Гардероб", icon: Shirt },
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Shirt },
    { href: "/admin/outfits", label: "Образы", icon: Home },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  const userNavItems = [
    { href: "/app", label: "Главная", icon: Home },
    { href: "/app/wardrobe", label: "Мой гардероб", icon: Shirt },
  ]

  const navItems = user.isAdmin ? adminNavItems : userNavItems

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={user.isAdmin ? "/admin" : "/app"} className="text-xl font-bold text-gray-900">
              Wardrobe AI
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                      isActive
                        ? "border-b-2 border-blue-500 text-gray-900"
                        : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="flex items-center">
            {/* Desktop User Menu */}
            <div className="hidden md:flex md:items-center md:space-x-4">
              <span className="text-sm text-gray-700">
                {user.email} {user.isAdmin && "(Админ)"}
              </span>
              <Avatar className="h-8 w-8">
                <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Выйти
              </Button>
            </div>

            {/* Mobile Menu */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <div className="flex flex-col space-y-4 mt-4">
                    <div className="flex items-center space-x-2 pb-4 border-b">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{user.email}</p>
                        <p className="text-xs text-gray-500">{user.isAdmin ? "Администратор" : "Пользователь"}</p>
                      </div>
                    </div>

                    {navItems.map((item) => {
                      const Icon = item.icon
                      const isActive = pathname === item.href
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
                            isActive ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}

                    <Button variant="outline" onClick={handleSignOut} className="mt-4 bg-transparent">
                      <LogOut className="h-4 w-4 mr-2" />
                      Выйти
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
