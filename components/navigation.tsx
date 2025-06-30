"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Menu, Home, Shirt, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavigationProps {
  user: any
  isAdmin: boolean
}

export function Navigation({ user, isAdmin }: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const handleSignOut = async () => {
    await fetch("/auth/signout", { method: "POST" })
    window.location.href = "/"
  }

  const userInitials = user?.email?.charAt(0).toUpperCase() || "U"

  const navigationItems = [
    {
      href: "/app",
      label: "Главная",
      icon: Home,
    },
    {
      href: "/app/wardrobe",
      label: "Мой гардероб",
      icon: Shirt,
    },
  ]

  return (
    <nav className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href={isAdmin ? "/admin" : "/app"} className="flex items-center gap-2 font-bold text-xl">
            <Shirt className="h-6 w-6" />
            Mode Morph
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {!isAdmin &&
              navigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}

            {/* User Menu */}
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-gray-600 hover:text-gray-900">
                <LogOut className="h-4 w-4 mr-2" />
                Выйти
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="flex flex-col gap-4 mt-8">
                  {!isAdmin &&
                    navigationItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          pathname === item.href
                            ? "bg-indigo-100 text-indigo-700"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}

                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center gap-3 px-3 py-2 mb-4">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-medium">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-gray-900">{user?.email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSignOut}
                      className="w-full justify-start text-gray-600 hover:text-gray-900"
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
    </nav>
  )
}
