"use client"

import { useState, useEffect, useRef } from "react"
import { Sheet, SheetContent, SheetOverlay, SheetPortal } from "@/components/ui/sheet"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { startRoboPayment } from "@/lib/payments"
import { toast } from "@/hooks/use-toast"
import { api } from "@/lib/api-client"

type Plan = "yearly" | "monthly"
type View = "subscription" | "credits"

interface SubscriptionSheetProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  variant?: "limitReached" | "explore" // limitReached = "У тебя закончились лимиты", explore = "Открой для себя безлимитные возможности"
  /** Where the paywall was triggered from (e.g. "limit:vton_used", "limit:outfits_saved").
   *  Logged with the paywall_shown event so conversions can be attributed to the
   *  feature that blocked the user. Optional — defaults to the variant. */
  source?: string
}

interface SubscriptionPlan {
  plan_type: string
  price_rub: number
  credits: number
  display_name: string
  description: string
}

interface CreditPack {
  id: number
  name: string
  price_rub: number
  credits: number
}

export function SubscriptionSheet({ isOpen, onClose, onSuccess, variant = "limitReached", source }: SubscriptionSheetProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly")
  const [currentView, setCurrentView] = useState<View>("subscription")
  const [isProcessing, setIsProcessing] = useState(false)
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([])
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([])
  const [loading, setLoading] = useState(true)
  const [currentSub, setCurrentSub] = useState<{ subscription_type: string; status: string; expires_at: string | null } | null>(null)

  // Swipe-to-dismiss states
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef<number>(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      fetchPricing()
      api.get("/api/user-subscription")
        .then((d) => setCurrentSub(d?.subscription || null))
        .catch(() => setCurrentSub(null))
    }
  }, [isOpen])

  // ── paywall_shown instrumentation ──
  // This sheet IS the paywall for every trigger in the app, so emitting here once
  // per open covers all of them in a single place. Fire-and-forget; tracking must
  // never block or break the paywall UX. The conversion funnel
  // (paywall_shown → conversions_to_premium) is computed off this event server-side.
  useEffect(() => {
    if (!isOpen) return
    void api
      .post("/api/usage/log", {
        feature: "paywall_shown",
        action: "view",
        count: 1,
        meta: {
          variant, // "limitReached" = real block, "explore" = upsell
          source: source || variant,
          pagePath: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      })
      .catch(() => {})
    // Intentionally keyed on isOpen only: one event per open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const fetchPricing = async () => {
    try {
      setLoading(true)
      const data = await api.get("/api/pricing")
      setSubscriptionPlans(data.subscriptions || [])
      setCreditPacks(data.credit_packs || [])
    } catch (error) {
      console.error("Error fetching pricing:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить цены",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getSelectedPlanData = () => {
    return subscriptionPlans.find(p => p.plan_type === selectedPlan)
  }

  const title = variant === "limitReached"
    ? "У тебя закончились лимиты"
    : "Открой для себя безлимитные возможности"
  const subtitle = variant === "limitReached"
    ? "Открой безграничные возможности"
    : "Выбери подходящий план"

  // Is the user already subscribed? (so we say "Продлить", not "Получить доступ")
  const subActive = !!currentSub && currentSub.status === "active" &&
    (!currentSub.expires_at || new Date(currentSub.expires_at) > new Date())
  const subExpiresLabel = currentSub?.expires_at
    ? new Date(currentSub.expires_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : ""

  const handleGetAccess = async () => {
    if (currentView === "subscription") {
      setIsProcessing(true)
      try {
        const plan = getSelectedPlanData()
        if (!plan) {
          toast({
            title: "Ошибка",
            description: "План не найден",
            variant: "destructive",
          })
          return
        }
        await startRoboPayment(
          plan.price_rub,
          `Подписка ${plan.display_name}`,
          { action: "subscribe", type: selectedPlan }
        )
        onSuccess?.()
      } catch (error) {
        console.error("Payment error:", error)
        toast({
          title: "Ошибка",
          description: "Не удалось начать оплату",
          variant: "destructive",
        })
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const handleBuyCreditPack = async (pack: CreditPack) => {
    setIsProcessing(true)
    try {
      await startRoboPayment(
        pack.price_rub,
        `Покупка ${pack.credits} кредитов`,
        { action: "buy_credits", packId: pack.id }
      )
      onSuccess?.()
    } catch (error) {
      console.error("Payment error:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось начать оплату",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleContinueFree = () => {
    onClose()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle')) return

    startYRef.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - startYRef.current

    if (deltaY > 0) {
      setDragY(deltaY)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)

    if (dragY > 100) {
      onClose()
    }

    setDragY(0)
  }

  useEffect(() => {
    if (!isOpen) {
      setDragY(0)
      setIsDragging(false)
    }
  }, [isOpen])

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetPortal>
        {/* Custom dark overlay */}
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <SheetPrimitive.Content
          ref={contentRef}
          className={cn(
            "fixed z-50 inset-x-0 bottom-0 rounded-t-3xl border-0 p-0 bg-[#F9FAFB] transition-all duration-300 overflow-hidden shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            currentView === "credits" ? "h-[85vh]" : "h-[65vh]"
          )}
          style={{
            transform: `translateY(${dragY}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onInteractOutside={(e) => e.preventDefault()}
        >
        {/* Drag handle */}
        <div className="drag-handle flex justify-center py-3 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Back button for credits view */}
        {currentView === "credits" && (
          <button
            onClick={() => setCurrentView("subscription")}
            className="absolute top-4 left-4 p-2 rounded-full transition-colors z-10 text-[#101010] hover:bg-gray-200"
            aria-label="Назад"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="px-6 pb-6 h-full flex flex-col text-[#101010]">
          {currentView === "subscription" ? (
            <div className="flex flex-col h-full space-y-4">
              {/* Header */}
              <div className="text-center space-y-1 pt-2 flex-shrink-0">
                <h2 className="text-xl font-bold text-[#101010]">
                  {title}
                </h2>
                <p className="text-sm text-[#101010]/70">
                  {subtitle}
                </p>
              </div>

              {subActive && (
                <div className="flex-shrink-0 rounded-xl bg-emerald-50 text-emerald-800 text-sm px-3 py-2 text-center">
                  ✓ Подписка активна{subExpiresLabel ? ` до ${subExpiresLabel}` : ""}. Покупка продлит её.
                </div>
              )}

              {/* Plan selection */}
              <div className="space-y-2 flex-shrink-0">
                {loading ? (
                  <div className="text-center py-8">Загрузка...</div>
                ) : (
                  subscriptionPlans.map((plan) => {
                    const key = plan.plan_type as Plan
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedPlan(key)}
                        className={cn(
                          "w-full p-3 rounded-xl bg-[#F5F4FF] transition-all relative",
                          selectedPlan === key && "bg-gradient-to-r from-[#EC9DE2]/10 to-[#89AEFF]/10"
                        )}
                        style={
                          selectedPlan === key
                            ? {
                                border: "2px solid transparent",
                                backgroundImage: "linear-gradient(#F5F4FF, #F5F4FF), linear-gradient(to right, #EC9DE2, #89AEFF)",
                                backgroundOrigin: "border-box",
                                backgroundClip: "padding-box, border-box",
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-left">
                            <div className="font-semibold text-sm text-[#101010]">{plan.display_name}</div>
                            <div className="text-xs text-[#101010]/60">
                              {key === "yearly"
                                ? `${plan.description} (${plan.price_rub} ₽)`
                                : plan.description
                              }
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-base text-[#101010]">
                              {key === "yearly"
                                ? `${Math.round(plan.price_rub / 12)} ₽`
                                : `${plan.price_rub} ₽`
                              }
                            </div>
                            <div className="text-xs text-[#101010]/60">
                              {key === "yearly" ? "в месяц" : `${plan.credits} кредитов`}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {/* Bottom section - fixed at bottom */}
              <div className="space-y-3 flex-shrink-0 mt-auto">
                {/* Get Access button */}
                <Button
                  onClick={handleGetAccess}
                  disabled={isProcessing}
                  className="w-full h-12 text-sm font-semibold rounded-xl text-white border-0"
                  style={{
                    background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
                  }}
                >
                  {isProcessing ? "Обработка..." : subActive ? "Продлить подписку" : "Получить доступ"}
                </Button>

                {/* View credit packs link */}
                <button
                  onClick={() => setCurrentView("credits")}
                  className="w-full text-center text-sm text-[#101010]/70 hover:text-[#101010] transition-colors underline"
                >
                  Посмотреть пакеты кредитов
                </button>

                {/* Continue free button */}
                <button
                  onClick={handleContinueFree}
                  className="w-full text-center text-sm text-[#101010] hover:text-[#101010]/70 transition-colors font-medium"
                >
                  Продолжить бесплатно
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2 pt-12">
                <h2 className="text-2xl font-bold text-[#101010]">
                  Пакеты кредитов
                </h2>
                <p className="text-base text-[#101010]/70">
                  Выберите подходящий пакет
                </p>
              </div>

              {/* Credit packs */}
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-8">Загрузка...</div>
                ) : (
                  creditPacks.map((pack) => (
                    <button
                      key={pack.id}
                      onClick={() => handleBuyCreditPack(pack)}
                      disabled={isProcessing}
                      className="w-full p-4 rounded-2xl bg-[#F5F4FF] hover:bg-[#F5F4FF]/80 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <div className="font-semibold text-[#101010]">{pack.name}</div>
                          <div className="text-xs text-[#101010]/60 mt-0.5">
                            {(pack.price_rub / pack.credits).toFixed(1)} ₽ за кредит
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg text-[#101010]">{pack.price_rub} ₽</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Continue free button */}
              <button
                onClick={handleContinueFree}
                className="w-full text-center text-[#101010] hover:text-[#101010]/70 transition-colors font-medium pt-4"
              >
                Продолжить бесплатно
              </button>
            </div>
          )}
        </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  )
}