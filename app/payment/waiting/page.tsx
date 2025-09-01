// app/payment/waiting/page.tsx
"use client"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { usePaymentStatus } from "@/hooks/use-payment-status"
import { Loader2, XCircle, CheckCircle2 } from "lucide-react"

export default function WaitingPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const invId = sp.get("InvId") || undefined
  const [paymentId, setPaymentId] = useState<string | undefined>(sp.get("paymentId") || undefined)
  const status = usePaymentStatus(paymentId)

  useEffect(() => {
    if (!paymentId && invId) {
      fetch(`/api/payments/by-inv?invId=${encodeURIComponent(invId)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => setPaymentId(d.paymentId))
        .catch(() => {})
    }
  }, [invId, paymentId])

  useEffect(() => {
    if (status === "paid") router.replace("/app")
  }, [status, router])

  if (!paymentId && !invId) return <div className="p-8">Некорректная ссылка ожидания оплаты.</div>

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
          <div className="text-lg font-medium">Оплачено 🎉 Перенаправляем…</div>
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
