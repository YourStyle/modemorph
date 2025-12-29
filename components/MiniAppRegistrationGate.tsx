"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { sessionAuth } from "@/lib/tma/session-auth"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"
import { NetworkError as NetworkErrorComponent } from "@/components/network-error"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        platform?: string
        initData?: string
        initDataUnsafe?: Record<string, any>
        ready: () => void
        expand?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        isVersionAtLeast?: (ver: string) => boolean
        disableVerticalSwipes?: () => void
        enableClosingConfirmation?: () => void
      }
    }
  }
}

// Extract initData from URL hash (Telegram passes it there before SDK parses it)
function getInitDataFromHash(): string | null {
  if (typeof window === "undefined") return null
  
  const hash = window.location.hash
  if (!hash) return null
  
  // Parse tgWebAppData from hash
  const match = hash.match(/tgWebAppData=([^&]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }
  return null
}

// Check if we're in TMA context
function checkTMAContext(): { inTMA: boolean; initData: string | null; tg: typeof window.Telegram.WebApp | undefined } {
  if (typeof window === "undefined") {
    return { inTMA: false, initData: null, tg: undefined }
  }
  
  const tg = window.Telegram?.WebApp
  
  // Try to get initData from Telegram SDK first
  let initData = tg?.initData?.trim() || null
  
  // If not available, try to extract from URL hash
  if (!initData) {
    initData = getInitDataFromHash()
  }
  
  console.log("[TMA Check] tg:", !!tg, "initData length:", initData?.length || 0)
  
  if (!initData || initData.length === 0) {
    return { inTMA: false, initData: null, tg }
  }
  
  return { inTMA: true, initData, tg }
}

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const onMiniReg = (pathname || "").startsWith("/auth/mini-registration")

  const [ready, setReady] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  useEffect(() => {
    console.log("[MiniAppRegistrationGate] Starting...")
    
    let cancelled = false

    async function boot() {
      try {
        const { inTMA, initData, tg } = checkTMAContext()
        
        console.log("[MiniAppRegistrationGate] TMA check:", { inTMA, hasInitData: !!initData })

        if (!inTMA || !initData) {
          console.log("[MiniAppRegistrationGate] Not in TMA, skipping handshake")
          if (!cancelled) setReady(true)
          return
        }

        console.log("[MiniAppRegistrationGate] In TMA! Doing handshake...")

        // Initialize Telegram UI
        if (tg) {
          try {
            tg.ready()
            tg.expand?.()
            tg.setHeaderColor?.("#FFFFFF")
            tg.setBackgroundColor?.("#0e0e10")
            tg.enableClosingConfirmation?.()
            if (tg.isVersionAtLeast?.("7.7")) {
              tg.disableVerticalSwipes?.()
            }
          } catch (e) {
            console.log("[MiniAppRegistrationGate] TG UI init error:", e)
          }
        }

        // Do handshake - send initData to backend
        console.log("[MiniAppRegistrationGate] Calling miniapp-session API...")
        
        const response = await fetchWithRetry(
          "/api/auth/telegram/miniapp-session",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
            cache: "no-store",
          },
          { timeout: 15000, retries: 2, retryDelay: 1000, backoff: true }
        )

        console.log("[MiniAppRegistrationGate] API response status:", response.status)

        if (!response.ok) {
          console.error("[MiniAppRegistrationGate] Handshake failed:", response.status)
          if (!onMiniReg && !cancelled) {
            router.replace("/auth/mini-registration?from=tma&error=handshake")
          }
          return
        }

        const data = await response.json()
        console.log("[MiniAppRegistrationGate] Handshake response:", { hasSession: !!data.session, hasUser: !!data.user })

        if (data.session && data.user) {
          // Parse expiration
          let expiresAt: number
          const exp = data.session.expires_at
          if (typeof exp === "number") {
            expiresAt = exp < 2000000000 ? exp * 1000 : exp
          } else if (typeof exp === "string") {
            expiresAt = new Date(exp).getTime()
          } else {
            expiresAt = Date.now() + 3600000
          }

          // Save session
          sessionAuth.saveSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user_id: data.user.id,
            expires_at: expiresAt
          })

          console.log("[MiniAppRegistrationGate] Session saved for user:", data.user.id)

          // Check profile
          try {
            const profileRes = await fetchWithRetry(
              "/api/me/profile",
              {
                headers: { "Authorization": "Bearer " + data.session.access_token },
                cache: "no-store",
              },
              { timeout: 10000, retries: 2 }
            )

            if (profileRes.ok) {
              const profileData = await profileRes.json()
              if (!profileData.profile && !onMiniReg && !cancelled) {
                router.replace("/auth/mini-registration?from=tma")
                return
              }
            }
          } catch (e) {
            console.log("[MiniAppRegistrationGate] Profile check error:", e)
          }

          console.log("[MiniAppRegistrationGate] All done, rendering app")
        } else {
          console.log("[MiniAppRegistrationGate] No session in response")
          if (!onMiniReg && !cancelled) {
            router.replace("/auth/mini-registration?from=tma")
          }
          return
        }
      } catch (error) {
        console.error("[MiniAppRegistrationGate] Boot error:", error)
        if (error instanceof NetworkError || error instanceof TimeoutError) {
          if (!cancelled) setNetworkError("Проблема с сетью")
          return
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    boot()
    return () => { cancelled = true }
  }, [router, pathname, onMiniReg])

  if (networkError) {
    return (
      <NetworkErrorComponent
        message={networkError}
        onRetry={() => {
          setNetworkError(null)
          setReady(false)
          window.location.reload()
        }}
      />
    )
  }

  if (!ready) {
    return (
      <div className="fixed inset-0 bg-[#f9fafb] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return <>{children}</>
}
