"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { sessionAuth } from "@/lib/tma/session-auth"
import { AnimatedLanding } from "@/components/animated-landing"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"
import { NetworkError as NetworkErrorComponent } from "@/components/network-error"

export default function HomePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [showLanding, setShowLanding] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  useEffect(() => {
    // Wait for AuthProvider to finish (including TMA handshake)
    if (authLoading) return

    // No user after auth completed — show landing
    if (!user) {
      console.log("[HomePage] No user after auth, showing landing")
      setShowLanding(true)
      return
    }

    // User authenticated — check profile and redirect
    const checkProfileAndRedirect = async () => {
      try {
        const accessToken = sessionAuth.getAccessToken()
        if (!accessToken) {
          console.log("[HomePage] No access token, redirecting to /app")
          router.replace("/app")
          return
        }

        console.log("[HomePage] User authenticated, checking profile...")
        const response = await fetchWithRetry(
          "/api/me",
          { headers: { Authorization: `Bearer ${accessToken}` } },
          { timeout: 8000, retries: 2 }
        )

        if (response.ok) {
          const userData = await response.json()
          if (userData.profile?.is_admin) {
            console.log("[HomePage] Admin user, redirecting to /admin")
            router.replace("/admin")
            return
          }
        }

        console.log("[HomePage] Regular user, redirecting to /app")
        router.replace("/app")
      } catch (error) {
        console.error("[HomePage] Error checking profile:", error)

        if (error instanceof NetworkError) {
          setNetworkError(error.isOffline ? "Нет подключения к интернету" : "Проблема с сетью")
          return
        } else if (error instanceof TimeoutError) {
          setNetworkError("Превышено время ожидания")
          return
        }

        // On other errors still redirect to app
        router.replace("/app")
      }
    }

    checkProfileAndRedirect()
  }, [authLoading, user, router])

  if (networkError) {
    return (
      <NetworkErrorComponent
        message={networkError}
        onRetry={() => {
          setNetworkError(null)
          window.location.reload()
        }}
      />
    )
  }

  if (showLanding) {
    return <AnimatedLanding />
  }

  // Show spinner while auth is loading or during redirect
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )
}
