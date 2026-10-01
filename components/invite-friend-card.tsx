"use client"

import { useEffect, useState } from "react"
import { Gift } from "lucide-react"
import { api } from "@/lib/api-client"
import { referralLink, shareLink } from "@/lib/referral"
import { useFeature } from "@/hooks/use-feature"

interface Referral {
  code: string
  percent_off: number
  reward_days: number
  invited: number
}

// «Пригласи подругу»: одна карточка на главную и в профиль. Код заводится
// лениво при первом /api/discounts/mine — до ответа ничего не рисуем, пустая
// карточка без кода бессмысленна. Награда пригласившему начисляется при оплате
// с этим кодом (backend/app/services/discounts.py).
export function InviteFriendCard({ title = "Пригласи подругу", place }: { title?: string; place: "home" | "profile" }) {
  const [referral, setReferral] = useState<Referral | null>(null)
  const { log } = useFeature()

  useEffect(() => {
    api.get("/api/discounts/mine")
      .then((d) => setReferral(d?.referral || null))
      .catch(() => {})
  }, [])

  if (!referral) return null

  const share = () => {
    void log("invite_share", "click", { place })
    const url = referralLink(referral.code)
    const text = `Собираю образы из своего гардероба в Mode Morph. Заходи — тебе ${referral.percent_off}% скидки на подписку:`
    void shareLink(url, text)
  }

  return (
    <div className="rounded-2xl bg-canvas-sunk p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Gift className="h-5 w-5 text-signal flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-body font-semibold text-ink">{title}</div>
          <div className="text-caption text-ink-2 mt-0.5">
            Подруге — {referral.percent_off}% скидки на подписку, тебе — {referral.reward_days} дней Premium, когда она оплатит.
            {referral.invited > 0 && ` Уже пришли: ${referral.invited}.`}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={share}
        className="w-full h-11 rounded-full bg-signal text-body font-semibold text-signal-ink transition-transform duration-press active:scale-[0.98]"
      >
        Отправить приглашение
      </button>
    </div>
  )
}
