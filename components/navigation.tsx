"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface UserProfile {
  email: string
  full_name?: string
  is_admin?: boolean
}

export function Navigation() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()

        if (authUser) {
          const response = await fetch("/api/user-profile")
          if (response.ok) {
            const { profile } = await response.json()
            setUser({
              email: authUser.email || "",
              full_name: profile?.full_name,
              is_admin: profile?.is_admin,
            })
          }
        }
      } catch (error) {
        console.error("Error loading user:", error)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const getUserInitials = () => {
    if (user?.full_name) {
      return user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    }
    return user?.email?.[0]?.toUpperCase() || "U"
  }

  if (loading) {
    return (
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
        </div>
      </nav>
    )
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-900">ModeMorph</h1>

          {/* Navigation links */}
          <div className="hidden md:flex items-center space-x-4">
            <Button variant={pathname === "/app" ? "default" : "ghost"} onClick={() => router.push("/app")} size="sm">
              Главная
            </Button>
            <Button
              variant={pathname === "/app/wardrobe" ? "default" : "ghost"}
              onClick={() => router.push("/app/wardrobe")}
              size="sm"
            >
              Гардероб
            </Button>
            <Button
              variant={pathname === "/app/looks" ? "default" : "ghost"}
              onClick={() => router.push("/app/looks")}
              size="sm"
            >
              Образы
            </Button>
            <Button
              variant={pathname === "/app/inspiration" ? "default" : "ghost"}
              onClick={() => router.push("/app/inspiration")}
              size="sm"
            >
              Вдохновение
            </Button>
          </div>
        </div>

        {/* User menu */}
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-sm">{getUserInitials()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none">{user?.full_name || "Пользователь"}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              {user?.is_admin && (
                <>
                  <DropdownMenuItem onClick={() => router.push("/admin")}>Панель администратора</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
