// app/payment/waiting/page.tsx
"use client"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { usePaymentStatus } from "@/hooks/use-payment-status"
import { Loader2, XCircle, CheckCircle2 } from "lucide-react"

export default function WaitingPage() {
  const sp = useSearchParams()
  const router = useRouter()
  // Robokassa appends InvId to the SuccessURL configured in the merchant cabinet.
  const invId = sp.get("InvId") || sp.get("invId") || undefined
  const status = usePaymentStatus(invId)

  useEffect(() => {
    if (status === "paid") {
      const t = setTimeout(() => router.replace("/app"), 1200)
      return () => clearTimeout(t)
    }
  }, [status, router])

  if (!invId) return <div className="p-8">Некорректная ссылка ожидания оплаты.</div>

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
