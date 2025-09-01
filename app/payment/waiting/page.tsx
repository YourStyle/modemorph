"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { usePaymentStatus } from "@/hooks/use-payment-status"
import { createClient } from "@/lib/supabase/client"
import { Loader2, XCircle, CheckCircle2 } from "lucide-react"

export default function WaitingPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const invId = sp.get("InvId") || undefined
  const [paymentId, setPaymentId] = useState<string | undefined>(sp.get("paymentId") || undefined)
  const status = usePaymentStatus(paymentId)
  const appliedRef = useRef(false) // чтобы не вызвать POST дважды

  // получаем paymentId по InvId, если нужно
  useEffect(() => {
    if (!paymentId && invId) {
      fetch(`/api/payments/by-inv?invId=${encodeURIComponent(invId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setPaymentId(d.paymentId))
        .catch(() => {})
    }
  }, [invId, paymentId])

  // когда платёж прошёл — читаем meta и дергаем user-subscription
  useEffect(() => {
    ;(async () => {
      if (status !== "paid" || !paymentId || appliedRef.current) return
      appliedRef.current = true

      const sb = createClient()
      // у тебя включен RLS на payments: select_own ⇒ пользователь увидит только свой платёж
      const { data: payment } = await sb.from("payments").select("meta").eq("id", paymentId).maybeSingle()

      const meta = (payment?.meta || {}) as any

      // ожидаем одну из форм:
      // { action: "subscribe", type: "monthly"|"yearly" }
      // { action: "buy_credits", packId: number }
      if (meta?.action === "subscribe") {
        await fetch("/api/user-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "subscribe", type: meta.type }),
        })
      } else if (meta?.action === "buy_credits") {
        await fetch("/api/user-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "buy_credits", packId: meta.packId }),
        })
      }
      // и уходим в приложение
      router.replace("/app")
    })()
  }, [status, paymentId, router])

  if (!paymentId && !invId) {
    return <div className="p-8">Некорректная ссылка ожидания оплаты.</div>
  }

  return (
    <div className="max-w-md mx-auto p-8 flex flex-col items-center text-center gap-3">
      {(status === "pending" || status === "unknown") && (
        <>
          <Loader2 className="h-8 w-8 animate-spin" />
          <div className="text-lg font-medium">Проверяем оплату…</div>
          <div className="text-muted-foreground text-sm">Обычно занимает несколько секунд.</div>
        </>
      )}
      {status === "paid" && (
        <>
          <CheckCircle2 className="h-8 w-8" />
          <div className="text-lg font-medium">Оплачено 🎉 Применяем доступ…</div>
        </>
      )}
      {(status === "failed" || status === "canceled") && (
        <>
          <XCircle className="h-8 w-8" />
          <div className="text-lg font-medium">Оплата не прошла</div>
        </>
      )}
    </div>
  )
}
