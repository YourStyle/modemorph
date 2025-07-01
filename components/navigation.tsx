"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Home, Shirt, Package, Users, Settings, LogOut } from "lucide-react"

interface User {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

interface UserProfile {
  is_admin: boolean
  full_name?: string
  avatar_url?: string
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          setUser(user)

          // Получаем профиль пользователя с обработкой ошибок
          try {
            const response = await fetch("/api/user-profile")

            if (response.ok) {
              const contentType = response.headers.get("content-type")
              if (contentType && contentType.includes("application/json")) {
                const { profile } = await response.json()
                setProfile(profile)
              } else {
                console.error("Response is not JSON:", await response.text())
              }
            } else {
              console.error("Profile fetch failed:", response.status, response.statusText)
            }
          } catch (error) {
            console.error("Error fetching profile:", error)
          }
        }
      } catch (error) {
        console.error("Error getting user:", error)
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
        setProfile(null)
        router.push("/auth/login")
      } else if (session?.user) {
        setUser(session.user)

        // Получаем профиль при изменении аутентификации
        try {
          const response = await fetch("/api/user-profile")

          if (response.ok) {
            const contentType = response.headers.get("content-type")
            if (contentType && contentType.includes("application/json")) {
              const { profile } = await response.json()
              setProfile(profile)
            }
          }
        } catch (error) {
          console.error("Error fetching profile on auth change:", error)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <nav className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="h-8 w-32 bg-gray-200 animate-pulse rounded"></div>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  if (!user) {
    return null
  }

  const adminNavItems = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/wardrobe", label: "Гардероб", icon: Shirt },
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Package },
    { href: "/admin/outfits", label: "Образы", icon: Users },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  const userNavItems = [
    { href: "/app", label: "Главная", icon: Home },
    { href: "/app/wardrobe", label: "Мой гардероб", icon: Shirt },
  ]

  const navItems = profile?.is_admin ? adminNavItems : userNavItems

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${
              mobile
                ? "flex items-center px-4 py-2 text-base font-medium rounded-md"
                : "inline-flex items-center px-1 pt-1 text-sm font-medium"
            } ${
              isActive
                ? mobile
                  ? "bg-gray-100 text-gray-900"
                  : "border-b-2 border-blue-500 text-gray-900"
                : mobile
                  ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Icon className={`${mobile ? "mr-3 h-5 w-5" : "mr-1 h-4 w-4"}`} />
            {item.label}
          </Link>
        )
      })}
    </>
  )

  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={profile?.is_admin ? "/admin" : "/app"} className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">
                {profile?.is_admin ? "Wardrobe Admin" : "Мой Гардероб"}
              </h1>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              <NavLinks />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* User Menu */}
            <div className="flex items-center space-x-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url || user.user_metadata?.avatar_url} />
                <AvatarFallback>
                  {profile?.full_name?.[0] || user.user_metadata?.full_name?.[0] || user.email?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="hidden md:block">
                <div className="text-sm font-medium text-gray-900">
                  {profile?.full_name || user.user_metadata?.full_name || "Пользователь"}
                </div>
                <div className="text-xs text-gray-500">{profile?.is_admin ? "Администратор" : "Пользователь"}</div>
              </div>

              <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden md:inline-flex">
                <LogOut className="h-4 w-4 mr-1" />
                Выйти
              </Button>
            </div>

            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <div className="flex flex-col h-full">
                  <div className="flex items-center space-x-3 pb-4 border-b">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={profile?.avatar_url || user.user_metadata?.avatar_url} />
                      <AvatarFallback>
                        {profile?.full_name?.[0] ||
                          user.user_metadata?.full_name?.[0] ||
                          user.email?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {profile?.full_name || user.user_metadata?.full_name || "Пользователь"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {profile?.is_admin ? "Администратор" : "Пользователь"}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 py-4 space-y-1">
                    <NavLinks mobile />
                  </div>

                  <div className="border-t pt-4">
                    <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start">
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
    </nav>
  )
}
