"use client"

import { useEffect, useState } from "react"
import { CommonSheet } from "@/components/common-sheet"
import { Button } from "@/components/ui/button"
import { Sparkles, Check } from "lucide-react"
import { api } from "@/lib/api-client"

interface GiftSheet {
  title?: string
  body?: string
  bullets?: string[]
  cta_text?: string
}

interface PendingGift {
  subscription_type?: string | null
  credits?: number | null
  sheet?: GiftSheet
  granted_at?: string | null
}

interface Props {
  gift: PendingGift | null
  onDismissed: () => void
}

const SUB_LABEL: Record<string, string> = {
  monthly: "на месяц",
  yearly: "на год",
}

export function WelcomeGiftSheet({ gift, onDismissed }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    if (gift) setIsOpen(true)
  }, [gift])

  const handleClose = async () => {
    if (dismissing) return
    setDismissing(true)
    try {
      await api.post("/api/me/dismiss-gift", {})
    } catch {
      // Best effort — even if the clear fails, don't lock the user inside the sheet.
    } finally {
      setIsOpen(false)
      setDismissing(false)
      onDismissed()
    }
  }

  if (!gift) return null

  const sheet = gift.sheet || {}
  const title = sheet.title || "Вам подарок"
  const body = sheet.body
  const bullets = sheet.bullets || []
  const ctaText = sheet.cta_text || "Отлично"
  const subLabel = gift.subscription_type ? SUB_LABEL[gift.subscription_type] : null

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} backgroundColor="white">
      <div className="flex flex-col items-center text-center pt-2 pb-6">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-fuchsia-500/15 to-violet-500/20 flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-fuchsia-600" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {(gift.credits || subLabel) && (
          <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-2">
            {subLabel && (
              <span className="rounded-full bg-fuchsia-50 text-fuchsia-700 px-3 py-1 text-sm font-medium">
                Подписка {subLabel}
              </span>
            )}
            {!!gift.credits && gift.credits > 0 && (
              <span className="rounded-full bg-violet-50 text-violet-700 px-3 py-1 text-sm font-medium">
                +{gift.credits} кредитов
              </span>
            )}
          </div>
        )}
        {body && <p className="mt-4 text-muted-foreground leading-relaxed">{body}</p>}
      </div>

      {bullets.length > 0 && (
        <ul className="space-y-3 mb-6">
          {bullets.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-emerald-700" />
              </div>
              <span className="text-foreground leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      )}

      <Button onClick={handleClose} className="w-full h-12 text-base" disabled={dismissing}>
        {ctaText}
      </Button>
    </CommonSheet>
  )
}
