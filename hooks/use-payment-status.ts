"use client"
import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"

export function usePaymentStatus(paymentId?: string) {
  const [status, setStatus] = useState<"pending"|"paid"|"failed"|"canceled"|"unknown">("unknown")

  useEffect(() => {
    if (!paymentId) return
    let mounted = true
    let timer: ReturnType<typeof setInterval>

    const poll = async () => {
      try {
        const data = await api.get(`/api/payments/by-inv?id=${paymentId}`)
        if (!mounted) return
        const s = data?.status || data?.data?.status
        if (s) setStatus(s)
        // Stop polling on terminal states
        if (s === "paid" || s === "failed" || s === "canceled") {
          clearInterval(timer)
        }
      } catch {
        // ignore polling errors
      }
    }

    poll()
    timer = setInterval(poll, 4000)

    return () => { mounted = false; clearInterval(timer) }
  }, [paymentId])

  return status
}
