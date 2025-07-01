"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Home, Shirt, Package, Palette, Settings, LogOut, User } from "lucide-react"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  is_admin: boolean
}

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function getUser() {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setUser(user)

        // Получаем профиль пользователя
        try {
          const response = await fetch("/api/user-profile")
          if (response.ok) {
            const { profile } = await response.json()
            setProfile(profile)
          }
        } catch (error) {
          console.error("Error fetching profile:", error)
        }
      }

      setLoading(false)
    }

    getUser()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading) {
    return (
      <nav className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="h-8 w-32 bg-gray-200 animate-pulse rounded" />
            </div>
          </div>
        </div>
      </nav>
    )
  }

  if (!user) {
    return null
  }

  // Определяем навигационные элементы в зависимости от роли
  const adminNavItems = [
    { href: "/admin", label: "Главная", icon: Home },
    { href: "/admin/wardrobe", label: "Гардероб", icon: Shirt },
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Package },
    { href: "/admin/outfits", label: "Образы", icon: Palette },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  const userNavItems = [
    { href: "/app", label: "Главная", icon: Home },
    { href: "/app/wardrobe", label: "Мой гардероб", icon: Shirt },
  ]

  const navItems = profile?.is_admin ? adminNavItems : userNavItems

  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
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
          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <Link href={profile?.is_admin ? "/admin" : "/app"} className="flex-shrink-0">
              <span className="text-xl font-bold text-gray-900">
                {profile?.is_admin ? "Wardrobe Admin" : "My Wardrobe"}
              </span>
            </Link>
            <div className="flex space-x-8">
              <NavItems />
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex md:items-center md:space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-medium text-gray-900">{profile?.full_name || user.email}</p>
                <p className="text-gray-500">{profile?.is_admin ? "Администратор" : "Пользователь"}</p>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden md:flex items-center">
              <LogOut className="h-4 w-4 mr-2" />
              Выйти
            </Button>

            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <div className="flex flex-col h-full">
                  <div className="flex items-center space-x-2 mb-6">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-gray-900">{profile?.full_name || user.email}</p>
                      <p className="text-sm text-gray-500">{profile?.is_admin ? "Администратор" : "Пользователь"}</p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-1">
                    <NavItems mobile />
                  </div>

                  <div className="pt-4 border-t">
                    <Button variant="ghost" onClick={handleSignOut} className="w-full justify-start">
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
