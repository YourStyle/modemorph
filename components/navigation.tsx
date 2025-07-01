"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Settings, UserIcon, Home, Shirt } from "lucide-react"

interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string
  role: "admin" | "user"
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchProfile(session.user.id)
        }
      } catch (error) {
        console.error("Error getting session:", error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)

      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    try {
      const response = await fetch("/api/user-profile")

      if (response.ok) {
        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
          const profileData = await response.json()
          setProfile(profileData)
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error)
    }
  }

  const handleSignOut = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  if (loading) {
    return (
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block">ModeMorph</span>
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      </nav>
    )
  }

  const isAdmin = profile?.role === "admin"
  const isInAdminArea = pathname?.startsWith("/admin")
  const isInUserArea = pathname?.startsWith("/app")

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block">ModeMorph</span>
          </Link>
        </div>

        {user && (
          <div className="mr-6 flex items-center space-x-6">
            {isAdmin && !isInUserArea && (
              <>
                <Link
                  href="/admin"
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/admin" ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/wardrobe"
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname?.startsWith("/admin/wardrobe") ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  Wardrobe
                </Link>
                <Link
                  href="/admin/outfits"
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname?.startsWith("/admin/outfits") ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  Outfits
                </Link>
                <Link
                  href="/admin/combinations"
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname?.startsWith("/admin/combinations") ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  Combinations
                </Link>
              </>
            )}

            {!isInAdminArea && (
              <>
                <Link
                  href="/app"
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/app" ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  <Home className="h-4 w-4 inline mr-1" />
                  Home
                </Link>
                <Link
                  href="/app/wardrobe"
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname?.startsWith("/app/wardrobe") ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  <Shirt className="h-4 w-4 inline mr-1" />
                  My Wardrobe
                </Link>
              </>
            )}
          </div>
        )}

        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={profile?.avatar_url || "/placeholder.svg"}
                        alt={profile?.full_name || user.email || ""}
                      />
                      <AvatarFallback>
                        {profile?.full_name
                          ? profile.full_name.charAt(0).toUpperCase()
                          : user.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      {profile?.full_name && <p className="font-medium">{profile.full_name}</p>}
                      <p className="w-[200px] truncate text-sm text-muted-foreground">{user.email}</p>
                      {profile?.role && <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>}
                    </div>
                  </div>
                  <DropdownMenuSeparator />

                  {isAdmin && (
                    <>
                      {isInUserArea ? (
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="cursor-pointer">
                            <Settings className="mr-2 h-4 w-4" />
                            Admin Panel
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem asChild>
                          <Link href="/app" className="cursor-pointer">
                            <UserIcon className="mr-2 h-4 w-4" />
                            User View
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuItem asChild>
                    <Link href="/admin/profile" className="cursor-pointer">
                      <UserIcon className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Button variant="ghost" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/sign-up">Sign Up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
