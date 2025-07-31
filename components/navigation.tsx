"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Home, Shirt, Sparkles, Heart, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const navigationItems = [
  {
    name: "Главная",
    href: "/app",
    icon: Home,
  },
  {
    name: "Гардероб",
    href: "/app/wardrobe",
    icon: Shirt,
  },
  {
    name: "Образы",
    href: "/app/looks",
    icon: Sparkles,
  },
  {
    name: "Вдохновение",
    href: "/app/inspiration",
    icon: Heart,
  },
]

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleNavigation = (href: string) => {
    router.push(href)
    setIsOpen(false)
  }

  return (
    <>
      {/* Desktop Navigation - Hidden on mobile */}
      <nav className="hidden md:flex items-center space-x-1 bg-white border-b border-gray-200 px-4 py-2">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Button
              key={item.href}
              variant={isActive ? "default" : "ghost"}
              onClick={() => handleNavigation(item.href)}
              className="flex items-center space-x-2"
              size="sm"
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
            </Button>
          )
        })}
      </nav>

      {/* Mobile Navigation */}
      <div className="md:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="p-2">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Навигация</h2>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Button
                    key={item.href}
                    variant={isActive ? "default" : "ghost"}
                    onClick={() => handleNavigation(item.href)}
                    className="w-full justify-start space-x-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Button>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      {/* Bottom Navigation for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50">
        <div className="grid grid-cols-4 gap-1 p-2">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Button
                key={item.href}
                variant={isActive ? "default" : "ghost"}
                onClick={() => handleNavigation(item.href)}
                className="flex flex-col items-center space-y-1 h-auto py-2"
                size="sm"
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{item.name}</span>
              </Button>
            )
          })}
        </div>
      </div>
    </>
  )
}
