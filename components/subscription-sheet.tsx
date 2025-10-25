"use client"

import { useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { startRoboPayment } from "@/lib/payments"
import { toast } from "@/hooks/use-toast"

type Plan = "yearly" | "monthly"
type View = "subscription" | "credits"

interface SubscriptionSheetProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  variant?: "limitReached" | "explore" // limitReached = "У тебя закончились лимиты", explore = "Открой для себя безлимитные возможности"
}

const SUBSCRIPTION_PLANS = {
  yearly: {
    id: "yearly",
    name: "Годовой план",
    price: 2499,
    credits: 480,
    description: "12 месяцев",
  },
  monthly: {
    id: "monthly",
    name: "Ежемесячно",
    price: 299,
    credits: 40,
    description: "1 месяц",
  },
}

const CREDIT_PACKS = [
  { id: "pack_10", name: "10 кредитов", price: 99, credits: 10 },
  { id: "pack_40", name: "40 кредитов", price: 299, credits: 40 },
  { id: "pack_100", name: "100 кредитов", price: 599, credits: 100 },
  { id: "pack_200", name: "200 кредитов", price: 999, credits: 200 },
]

export function SubscriptionSheet({ isOpen, onClose, onSuccess, variant = "limitReached" }: SubscriptionSheetProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly")
  const [currentView, setCurrentView] = useState<View>("subscription")
  const [isProcessing, setIsProcessing] = useState(false)

  const title = variant === "limitReached"
    ? "У тебя закончились лимиты"
    : "Открой для себя безлимитные возможности"
  const subtitle = variant === "limitReached"
    ? "Открой безграничные возможности"
    : "Выбери подходящий план"

  const handleGetAccess = async () => {
    if (currentView === "subscription") {
      setIsProcessing(true)
      try {
        const plan = SUBSCRIPTION_PLANS[selectedPlan]
        await startRoboPayment(
          plan.price,
          `Подписка ${plan.name}`,
          { type: selectedPlan, credits: plan.credits }
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

  const handleBuyCreditPack = async (pack: typeof CREDIT_PACKS[0]) => {
    setIsProcessing(true)
    try {
      await startRoboPayment(
        pack.price,
        `Покупка ${pack.credits} кредитов`,
        { type: "credits", credits: pack.credits }
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

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-3xl border-0 p-0 bg-[#F9FAFB] transition-all duration-300 overflow-hidden",
          currentView === "credits" ? "h-[85vh]" : "h-[65vh]"
        )}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
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

              {/* Plan selection */}
              <div className="space-y-2 flex-shrink-0">
                {(Object.entries(SUBSCRIPTION_PLANS) as [Plan, typeof SUBSCRIPTION_PLANS.yearly][]).map(([key, plan]) => (
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
                        <div className="font-semibold text-sm text-[#101010]">{plan.name}</div>
                        <div className="text-xs text-[#101010]/60">{plan.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-base text-[#101010]">{plan.price} ₽</div>
                        <div className="text-xs text-[#101010]/60">{plan.credits} кредитов</div>
                      </div>
                    </div>
                  </button>
                ))}
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
                  {isProcessing ? "Обработка..." : "Получить доступ"}
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
                {CREDIT_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => handleBuyCreditPack(pack)}
                    disabled={isProcessing}
                    className="w-full p-4 rounded-2xl bg-[#F5F4FF] hover:bg-[#F5F4FF]/80 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <div className="font-semibold text-[#101010]">{pack.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-[#101010]">{pack.price} ₽</div>
                      </div>
                    </div>
                  </button>
                ))}
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
      </SheetContent>
    </Sheet>
  )
}