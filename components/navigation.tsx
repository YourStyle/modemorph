"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, Settings, LogOut, Shield } from "lucide-react"

interface UserProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  is_admin: boolean
}

export function Navigation() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    try {
      const data = await api.get("/api/me/profile-session")
      if (data?.profile) {
        setProfile({
          id: data.profile.id || data.user?.id,
          full_name: data.profile.full_name,
          avatar_url: data.profile.avatar_url,
          is_admin: data.profile.is_admin || false,
        })
      }
    } catch {
      // Not authenticated or profile not found
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await api.post("/api/auth/signout")
      router.push("/")
    } catch {
      // ignore
    }
  }

  const navigateToProfile = () => {
    router.push("/app/profile")
  }

  const navigateToAdmin = () => {
    if (profile?.is_admin) {
      router.push("/admin")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        <div className="animate-pulse">
          <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={() => router.push("/auth/login")}>
          Войти
        </Button>
        <Button onClick={() => router.push("/auth/sign-up")}>Регистрация</Button>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile.avatar_url || ""} alt={profile.full_name || ""} />
              <AvatarFallback>{profile.full_name ? profile.full_name[0].toUpperCase() : "U"}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              <p className="font-medium">{profile.full_name || "Пользователь"}</p>
              {profile.is_admin && <p className="text-xs text-blue-600">Администратор</p>}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={navigateToProfile}>
            <User className="mr-2 h-4 w-4" />
            <span>Профиль</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/app/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Настройки</span>
          </DropdownMenuItem>
          {profile.is_admin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={navigateToAdmin}>
                <Shield className="mr-2 h-4 w-4" />
                <span>Админ панель</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Выйти</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
