"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { tmaHandshake } from "@/lib/tma/handshake"
import { sessionAuth } from "@/lib/tma/session-auth"
import { fetchWithRetry, NetworkError, TimeoutError } from "@/lib/fetch-with-retry"
import { NetworkError as NetworkErrorComponent } from "@/components/network-error"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        platform?: string
        version?: string
        colorScheme?: string
        initData?: string
        initDataUnsafe?: Record<string, any>
        isExpanded?: boolean
        viewportStableHeight?: number
        onEvent?: (event: string, cb: (...args: any[]) => void) => void
        offEvent?: (event: string, cb: (...args: any[]) => void) => void
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (c: string) => void
        setBackgroundColor?: (c: string) => void
        isVersionAtLeast?: (ver: string) => boolean
        enableClosingConfirmation?: () => void
        disableClosingConfirmation?: () => void
        enableVerticalSwipes?: () => void
        disableVerticalSwipes?: () => void
      }
    }
  }
}

function detectTMA() {
  console.log("[detectTMA] START")
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  console.log("[detectTMA] window.Telegram:", typeof window !== "undefined" ? window.Telegram : "window undefined")
  console.log("[detectTMA] window.Telegram.WebApp:", tg)
  
  const hasInit = !!(tg?.initData && tg.initData.trim().length > 0)
  const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
  const platformOk = !!tg?.platform && tg.platform !== "unknown"
  
  console.log("[detectTMA] Results:", { 
    hasTg: !!tg, 
    hasInit, 
    hasUser, 
    platformOk, 
    platform: tg?.platform, 
    initDataLength: tg?.initData?.length,
    initDataUnsafe: tg?.initDataUnsafe
  })
  
  const result = { inTMA: !!tg && hasInit && hasUser && platformOk, tg }
  console.log("[detectTMA] Final result inTMA:", result.inTMA)
  return result
}

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  console.log("[MiniAppRegistrationGate] Component rendering")
  
  const router = useRouter()
  const pathname = usePathname()
  const onMiniReg = (pathname || "").startsWith("/auth/mini-registration")

  const [ready, setReady] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const fsTried = useRef(false)
  
  console.log("[MiniAppRegistrationGate] State:", { ready, pathname, onMiniReg })

  useEffect(() => {
    console.log("[MiniAppRegistrationGate] useEffect START")
    
    let cancelled = false
    let redirecting = false
    
    async function boot() {
      console.log("[MiniAppRegistrationGate] boot() START")
      
      try {
        const { inTMA, tg } = detectTMA()

        if (!inTMA || !tg) {
          console.log("[MiniAppRegistrationGate] Not in TMA, skipping handshake. inTMA:", inTMA, "tg:", !!tg)
          return
        }

        console.log("[MiniAppRegistrationGate] In TMA, starting handshake flow")

        // init TMA
        try {
          tg.ready()
          tg.setHeaderColor?.("#FFFFFF")
          tg.setBackgroundColor?.("#0e0e10")
        } catch (e) {
          console.log("[MiniAppRegistrationGate] TG init error:", e)
        }

        // 1) Хэндшейк
        let user = null
        let handshakeAttempts = 0
        const maxHandshakeAttempts = 3

        while (!user && handshakeAttempts < maxHandshakeAttempts) {
          handshakeAttempts++
          console.log("[MiniAppRegistrationGate] Handshake attempt", handshakeAttempts)

          try {
            user = await tmaHandshake()
            console.log("[MiniAppRegistrationGate] Handshake result:", user)
            if (user) break
            
            if (handshakeAttempts < maxHandshakeAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          } catch (error) {
            console.error("[MiniAppRegistrationGate] Handshake error:", error)
            if (handshakeAttempts < maxHandshakeAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }
        }

        if (!user) {
          console.log("[MiniAppRegistrationGate] No user after handshake, redirecting")
          if (!onMiniReg) {
            redirecting = true
            router.replace("/auth/mini-registration?from=tma")
          }
          return
        }

        // 3) Проверяем профиль
        console.log("[MiniAppRegistrationGate] User authenticated, checking profile")

        const accessToken = sessionAuth.getAccessToken()
        if (!accessToken) {
          console.log("[MiniAppRegistrationGate] No access token")
          if (!onMiniReg) {
            redirecting = true
            router.replace("/auth/mini-registration?from=tma")
          }
          return
        }

        console.log("[MiniAppRegistrationGate] Fetching profile")
        
        try {
          const profileResponse = await fetchWithRetry(
            "/api/me/profile",
            {
              headers: { "Authorization": "Bearer " + accessToken },
              cache: "no-store",
            },
            { timeout: 15000, retries: 3, retryDelay: 1000, backoff: true }
          )

          console.log("[MiniAppRegistrationGate] Profile response:", profileResponse.status)

          if (profileResponse.ok) {
            const profileData = await profileResponse.json()
            console.log("[MiniAppRegistrationGate] Profile data:", profileData)
            
            if (!profileData.profile && !onMiniReg) {
              redirecting = true
              router.replace("/auth/mini-registration?from=tma")
              return
            }
          }
        } catch (error) {
          console.error("[MiniAppRegistrationGate] Profile error:", error)
          if (error instanceof NetworkError || error instanceof TimeoutError) {
            setNetworkError("Проблема с сетью")
            return
          }
        }

        console.log("[MiniAppRegistrationGate] All checks passed")
      } finally {
        console.log("[MiniAppRegistrationGate] boot() finally, cancelled:", cancelled, "redirecting:", redirecting)
        if (!cancelled && !redirecting) setReady(true)
      }
    }

    boot()
    
    return () => {
      console.log("[MiniAppRegistrationGate] useEffect cleanup")
      cancelled = true
    }
  }, [router, pathname, onMiniReg])

  console.log("[MiniAppRegistrationGate] Before render, ready:", ready, "networkError:", networkError)

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
    console.log("[MiniAppRegistrationGate] Rendering loader")
    return (
      <div className="fixed inset-0 bg-[#f9fafb]/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }
  
  console.log("[MiniAppRegistrationGate] Rendering children")
  return <>{children}</>
}
