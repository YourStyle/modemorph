"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Menu, Home, Shirt, Package, Palette, Settings, LogOut, UserIcon } from "lucide-react"

interface UserProfile {
  id: string
  email?: string
  isAdmin: boolean
}

export function Navigation() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()

        if (authUser) {
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("is_admin")
            .eq("user_id", authUser.id)
            .single()

          setUser({
            id: authUser.id,
            email: authUser.email,
            isAdmin: profile?.is_admin || false,
          })
        }
      } catch (error) {
        console.error("Error getting user:", error)
      } finally {
        setLoading(false)
      }
    }

    getUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
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
    return (
      <nav className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900">
                Wardrobe AI
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth/login">
                <Button variant="ghost">Войти</Button>
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
    { href: "/admin/wardrobe/basics", label: "Базовые вещи", icon: Package },
    { href: "/admin/outfits", label: "Образы", icon: Palette },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  const userNavItems = [
    { href: "/app", label: "Главная", icon: Home },
    { href: "/app/wardrobe", label: "Мой гардероб", icon: Shirt },
  ]

  const navItems = user.isAdmin ? adminNavItems : userNavItems

  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            } ${mobile ? "w-full" : ""}`}
            onClick={() => mobile && setMobileOpen(false)}
          >
            <Icon className="h-4 w-4 mr-2" />
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
          {/* Logo */}
          <div className="flex items-center">
            <Link href={user.isAdmin ? "/admin" : "/app"} className="text-xl font-bold text-gray-900">
              Wardrobe AI
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <NavItems />
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <UserIcon className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-700">{user.email}</span>
              {user.isAdmin && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Admin</span>}
            </div>

            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Выйти
            </Button>

            {/* Mobile menu button */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <div className="flex flex-col space-y-4 mt-8">
                  <div className="flex items-center space-x-2 pb-4 border-b">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <UserIcon className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{user.email}</div>
                      {user.isAdmin && <div className="text-xs text-blue-600">Администратор</div>}
                    </div>
                  </div>
                  <NavItems mobile />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  )
}
