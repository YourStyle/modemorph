// app/payment/waiting/page.tsx
"use client"
import type React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { usePaymentStatus } from "@/hooks/use-payment-status"
import { api } from "@/lib/api-client"
import { Loader2, XCircle, CheckCircle2, Sparkles, CreditCard } from "lucide-react"

interface SubInfo {
  subscription: { subscription_type: string; status: string; expires_at: string | null } | null
  credits: number
}

const PLAN_LABEL: Record<string, string> = {
  monthly: "Ежемесячная подписка",
  yearly: "Годовая подписка",
  pro: "Подписка Pro",
}

const GRADIENT = "linear-gradient(to right, #EC9DE2, #89AEFF)"

function fmtDate(s: string | null): string {
  if (!s) return ""
  try {
    return new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return ""
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-white">{children}</div>
  )
}

export default function WaitingPage() {
  const sp = useSearchParams()
  const router = useRouter()
  // Robokassa appends InvId to the SuccessURL configured in the merchant cabinet.
  const invId = sp.get("InvId") || sp.get("invId") || undefined
  const status = usePaymentStatus(invId)
  const [info, setInfo] = useState<SubInfo | null>(null)

  // On success, load what the user actually got, to show it on the screen.
  useEffect(() => {
    if (status === "paid") {
      api.get("/api/user-subscription").then(setInfo).catch(() => {})
    }
  }, [status])

  if (!invId) {
    return (
      <Centered>
        <p className="text-gray-500">Некорректная ссылка ожидания оплаты.</p>
      </Centered>
    )
  }

  if (status === "pending" || status === "unknown") {
    return (
      <Centered>
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#EC9DE2]/20 to-[#89AEFF]/20 flex items-center justify-center mb-5">
          <Loader2 className="h-8 w-8 animate-spin text-[#B97DC6]" />
        </div>
        <h1 className="text-xl font-bold text-[#101010]">Проверяем оплату…</h1>
        <p className="text-sm text-gray-500 mt-2">Обычно занимает несколько секунд. Не закрывай страницу.</p>
      </Centered>
    )
  }

  if (status === "failed" || status === "canceled") {
    return (
      <Centered>
        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-5">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-[#101010]">Оплата не прошла</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">Деньги не списаны. Попробуй ещё раз — это займёт минуту.</p>
        <button
          onClick={() => router.replace("/app")}
          className="w-full max-w-xs h-12 rounded-xl text-white font-semibold"
          style={{ background: GRADIENT }}
        >
          Вернуться в приложение
        </button>
      </Centered>
    )
  }

  // status === "paid"
  const sub = info?.subscription
  const active = !!sub && sub.status === "active"
  const hasCredits = typeof info?.credits === "number" && info.credits > 0

  return (
    <Centered>
      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#EC9DE2] to-[#89AEFF] flex items-center justify-center mb-5 shadow-lg">
        <CheckCircle2 className="h-11 w-11 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-[#101010]">Оплата прошла! 🎉</h1>
      <p className="text-sm text-gray-500 mt-2">Спасибо! Доступ уже активирован.</p>

      <div className="w-full max-w-xs mt-6 rounded-2xl bg-[#F5F4FF] p-4 text-left space-y-3">
        {active && (
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-[#B97DC6] mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-[#101010]">{PLAN_LABEL[sub!.subscription_type] || "Подписка"}</div>
              <div className="text-sm text-gray-600">
                Активна до {fmtDate(sub!.expires_at)} · безлимитный доступ ко всем функциям
              </div>
            </div>
          </div>
        )}
        {hasCredits && (
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-[#B97DC6] mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-[#101010]">{info!.credits} кредитов на счету</div>
              <div className="text-sm text-gray-600">Трать на анализ гардероба, образы и примерку</div>
            </div>
          </div>
        )}
        {!active && !hasCredits && (
          <div className="text-sm text-gray-600">Доступ активирован — приятного пользования!</div>
        )}
      </div>

      <button
        onClick={() => router.replace("/app")}
        className="w-full max-w-xs h-12 mt-6 rounded-xl text-white font-semibold"
        style={{ background: GRADIENT }}
      >
        Перейти в приложение
      </button>
    </Centered>
  )
}
