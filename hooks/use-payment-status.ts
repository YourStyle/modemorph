"use client"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function usePaymentStatus(paymentId?: string) {
  const [status, setStatus] = useState<"pending"|"paid"|"failed"|"canceled"|"unknown">("unknown")

  useEffect(() => {
    if (!paymentId) return
    const sb = createClient()
    let mounted = true

    sb.from("payments").select("status").eq("id", paymentId).maybeSingle()
      .then(({ data }) => mounted && setStatus((data?.status as any) ?? "pending"))

    const ch = sb.channel(`payments:${paymentId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${paymentId}` },
      (p) => {
        const s = (p.new as any)?.status
        if (s) setStatus(s)
      }
    ).subscribe()

    return () => { mounted = false; sb.removeChannel(ch) }
  }, [paymentId])

  return status
}
