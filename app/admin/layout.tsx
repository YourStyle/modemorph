import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, LayoutDashboard, Shirt, Users, Shuffle, Settings } from 'lucide-react'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Проверяем права администратора
  const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

  if (!profile?.is_admin) {
    redirect("/app")
  }

  const navigationItems = [
    { href: "/admin", label: "Главная", icon: LayoutDashboard },
    { href: "/admin/wardrobe", label: "Гардероб", icon: Shirt },
    { href: "/admin/outfits", label: "Образы", icon: Users },
    { href: "/admin/combinations", label: "Комбинации", icon: Shuffle },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                Админ панель
              </Link>
              
              {/* Desktop Navigation */}
              <nav className="hidden md:flex ml-8 space-x-1">
                {navigationItems.map((item) => {
                  const IconComponent = item.icon
                  return (
                    <Link 
                      key={item.href}
                      href={item.href} 
                      className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200"
                    >
                      <IconComponent className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <span className="hidden sm:block text-sm text-gray-600">{user.email}</span>
              <Link href="/app" className="hidden sm:block">
                <Button variant="outline" size="sm">
                  В приложение
                </Button>
              </Link>
              <form action="/auth/signout" method="post" className="hidden sm:block">
                <Button variant="ghost" size="sm" type="submit">
                  Выйти
                </Button>
              </form>

              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="sm">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                  <div className="flex flex-col space-y-4 mt-6">
                    <div className="pb-4 border-b">
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                    
                    <nav className="flex flex-col space-y-1">
                      {navigationItems.map((item) => {
                        const IconComponent = item.icon
                        return (
                          <Link 
                            key={item.href}
                            href={item.href} 
                            className="flex items-center space-x-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3 py-3 rounded-md text-base font-medium transition-all duration-200"
                          >
                            <IconComponent className="h-5 w-5" />
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}
                    </nav>

                    <div className="pt-4 border-t space-y-2">
                      <Link href="/app" className="block">
                        <Button variant="outline" size="sm" className="w-full">
                          В приложение
                        </Button>
                      </Link>
                      <form action="/auth/signout" method="post">
                        <Button variant="ghost" size="sm" type="submit" className="w-full">
                          Выйти
                        </Button>
                      </form>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
