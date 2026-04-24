"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { WelcomeGiftSheet } from "@/components/welcome-gift-sheet"

export function WelcomeGiftGate() {
  const [gift, setGift] = useState<any | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get("/api/me/profile-session")
        const pending = data?.profile?.pending_gift
        if (!cancelled && pending && typeof pending === "object") {
          setGift(pending)
        }
      } catch {
        // No gift or not authed yet — silent.
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loaded])

  return <WelcomeGiftSheet gift={gift} onDismissed={() => setGift(null)} />
}
