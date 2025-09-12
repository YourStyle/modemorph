"use client"

import { useEffect } from "react"
import { toast } from "sonner"

export default function VpnWarning() {
  useEffect(() => {
    const checkVpn = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/")
        if (!res.ok) return
        const data = await res.json()
        const org = typeof data.org === "string" ? data.org : ""
        if (/vpn|proxy|hosting/i.test(org)) {
          toast("Приложение может работать нестабильно при использовании VPN. Пожалуйста, отключите VPN.")
        }
      } catch (e) {
        // ignore network errors
      }
    }

    checkVpn()
  }, [])

  return null
}
