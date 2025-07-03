"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Home, Shirt, Package, Users, Settings, LogOut } from "lucide-react"
import type { User } from "@supabase/supabase-js"

interface UserProfile {
  id: string
  user_id: string
  email: string
  is_admin: boolean
  created_at: string
  updated_at: string
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const response = await fetch("/api/user-profile")
        if (response.ok) {
          const { profile } = await response.json()
          setProfile(profile)
        }
      }
      setLoading(false)
    }

    getUser()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading) {
    return (
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="animate-pulse bg-gray-200 h-8 w-32 rounded"></div>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  if (!user || !profile) {
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

  const navItems = profile.is_admin ? adminNavItems : userNavItems

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
                  ? "bg-indigo-100 text-indigo-900"
                  : "border-b-2 border-indigo-500 text-gray-900"
                : mobile
                  ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Icon className={`${mobile ? "mr-3" : "mr-1"} h-4 w-4`} />
            {item.label}
          </Link>
        )
      })}
    </>
  )

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href={profile.is_admin ? "/admin" : "/app"} className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">{profile.is_admin ? "Wardrobe Admin" : "My Wardrobe"}</h1>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <NavLinks />
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
                <p className="text-xs text-gray-500">{profile.is_admin ? "Администратор" : "Пользователь"}</p>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden md:flex">
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
                      <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.email}</p>
                      <p className="text-xs text-gray-500">{profile.is_admin ? "Администратор" : "Пользователь"}</p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-1">
                    <NavLinks mobile />
                  </div>

                  <div className="pt-4 border-t">
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
