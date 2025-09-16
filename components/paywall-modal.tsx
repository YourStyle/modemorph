"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Check, Sparkles, Zap, X, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { startRoboPayment } from "@/lib/payments"

interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface CreditPack {
  id: number
  name: string
  credits: number
  price_rub: number
}

interface SubscriptionData {
  subscription: any
  credits: { credits_balance: number }
  creditPacks: CreditPack[]
}

export function PaywallModal({ isOpen, onClose, onSuccess }: PaywallModalProps) {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [purchasing, setPurchasing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/user-subscription", {
        credentials: "include",
      })
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error("Error loading subscription data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (type: "monthly" | "yearly") => {
  setPurchasing(true)
  try {
    const amount = type === "monthly" ? 299 : 2990
    const desc   = type === "monthly" ? "Подписка Pro (месяц)" : "Подписка Pro (год)"
    // ← meta сообщает, что после оплаты нужно активировать подписку
    await startRoboPayment(amount, desc, { action: "subscribe", type })
  } catch (e: any) {
    toast.error(e.message || "Ошибка при переходе к оплате")
    setPurchasing(false)
  }
}

// покупка кредит-пака
const handleBuyCredits = async (packId: number) => {
  setPurchasing(true)
  try {
    const pack = data?.creditPacks.find(p => p.id === packId)
    if (!pack) throw new Error("Пакет не найден")

    await startRoboPayment(
      pack.price_rub,
      `Покупка кредитов: ${pack.name}`,
      { action: "buy_credits", packId } // ← meta для post-активации
    )
  } catch (e: any) {
    toast.error(e.message || "Ошибка при переходе к оплате")
    setPurchasing(false)
  }
}

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-full h-full max-w-none max-h-none m-0 p-0 bg-gray-900">
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const hasSubscription = data?.subscription?.status === "active"

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full h-full max-w-none max-h-none m-0 p-0 bg-gray-900 text-white overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 pt-20 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-purple-400" />
              <h2 className="text-xl font-semibold">Получить больше возможностей</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-8 max-w-4xl mx-auto pb-24">
          {/* Current Credits */}
          <div className="text-center p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="text-gray-400 mb-2">Ваши кредиты</div>
            <div className="text-3xl font-bold text-white">{data?.credits?.credits_balance || 0}</div>
          </div>

          {/* Subscription Section */}
          {!hasSubscription && (
            <div className="space-y-6">
              <h3 className="font-semibold text-2xl text-center text-white">Подписка Pro</h3>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Monthly Subscription */}
                <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6 space-y-4">
                  <div className="text-center">
                    <div className="text-xl font-semibold text-white mb-2">Pro месяц</div>
                    <div className="text-gray-400 mb-4">299 ₽/мес</div>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3 text-gray-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span>40 кредитов в месяц</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span>Генерация образов на аватаре</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span>Отцифровка больше 10 вещей</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span>Неограниченное общение с ИИ-стилистом</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleSubscribe("monthly")}
                    disabled={purchasing}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white border-0 py-3 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    Оформить подписку
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M5 12H19M19 12L12 5M19 12L12 19"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </div>

                {/* Yearly Subscription */}
                <div className="bg-gray-800/30 border border-purple-500/30 rounded-xl p-6 space-y-4 relative">
                  <Badge className="absolute -top-3 left-6 bg-gradient-to-r from-green-500 to-green-600 text-white px-3 py-1">
                    Выгодно
                  </Badge>

                  <div className="text-center">
                    <div className="text-xl font-semibold text-white mb-2">Pro год</div>
                    <div className="text-gray-400 mb-1">2 990 ₽/год</div>
                    <div className="text-green-400 text-sm font-medium">(≈249 ₽/мес, экономия ~17%)</div>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3 text-gray-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span>480 кредитов в год</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <span>Все возможности Pro</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleSubscribe("yearly")}
                    disabled={purchasing}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white border-0 py-3 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    Оформить подписку
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M5 12H19M19 12L12 5M19 12L12 19"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Credit Packs */}
          <div className="space-y-6">
            <h3 className="font-semibold text-2xl text-center flex items-center justify-center gap-3 text-white">
              <Zap className="h-6 w-6 text-yellow-400" />
              Купить кредиты
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {data?.creditPacks?.map((pack) => (
                <div
                  key={pack.id}
                  className="bg-gray-800/30 border border-gray-700 rounded-xl p-4 text-center space-y-3 hover:border-gray-600 transition-colors"
                >
                  <div className="font-medium text-white">{pack.name}</div>
                  <div className="text-2xl font-bold text-purple-400">{pack.credits}</div>
                  <div className="text-gray-400">{pack.price_rub} ₽</div>
                  <div className="text-xs text-gray-500">≈{Math.round(pack.price_rub / pack.credits)} ₽/токен</div>
                  <Button
                    size="sm"
                    className="w-full border border-purple-500/50 bg-transparent text-purple-400 hover:bg-gradient-to-r hover:from-purple-600 hover:to-purple-700 hover:text-white hover:border-transparent transition-all duration-200"
                    onClick={() => handleBuyCredits(pack.id)}
                    disabled={purchasing}
                  >
                    Купить
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Credit Usage Info */}
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <div className="font-medium mb-4 text-white text-center">Стоимость действий:</div>
            <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>Отцифровка вещи: 5 токенов</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>Запрос к ИИ-стилисту: 2 токена</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>Доп. просмотры идей: 2 токена за 5 образов</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>Сохранить доп. образ: 1 токен</span>
              </div>
            </div>
          </div>

          {/* Limits Info */}
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <div className="font-medium mb-4 text-white text-center">Лимиты для бесплатных пользователей:</div>
            <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span>Гардероб: 20 вещей всего, 5 в день</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span>ИИ-стилист: 1 запрос в день</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span>Идеи: 10 образов в день</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span>Образы: до 20 сохраненных</span>
              </div>
            </div>
          </div>
        </div>

        {/* Нижняя плашка-предупреждение */}
        <div className="sticky bottom-0 z-20 bg-yellow-500/10 backdrop-blur-sm border-t border-yellow-500/30">
          <div className="max-w-4xl mx-auto px-4 py-3 text-sm text-yellow-300 flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Убедитесь что у вас выключен VPN перед покупкой</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
