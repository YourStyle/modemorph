"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Check, Sparkles, Zap } from "lucide-react"
import { toast } from "sonner"

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
      const response = await fetch("/api/user-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "subscribe", type }),
      })

      const result = await response.json()
      if (response.ok) {
        toast.success(result.message)
        onSuccess?.()
        onClose()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Ошибка при оформлении подписки")
    } finally {
      setPurchasing(false)
    }
  }

  const handleBuyCredits = async (packId: number) => {
    setPurchasing(true)
    try {
      const response = await fetch("/api/user-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "buy_credits", packId }),
      })

      const result = await response.json()
      if (response.ok) {
        toast.success(result.message)
        onSuccess?.()
        onClose()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Ошибка при покупке кредитов")
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const hasSubscription = data?.subscription?.status === "active"

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="h-6 w-6 text-purple-600" />
              <span>Получить больше возможностей</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Credits */}
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">Ваши кредиты</div>
            <div className="text-2xl font-bold text-gray-900">{data?.credits?.credits_balance || 0}</div>
          </div>

          {/* Subscription Section */}
          {!hasSubscription && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg text-center">Подписка Pro</h3>

              {/* Monthly Subscription */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">Pro месяц</div>
                    <div className="text-sm text-gray-600">299 ₽/мес</div>
                  </div>
                  <Button
                    onClick={() => handleSubscribe("monthly")}
                    disabled={purchasing}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    Оформить
                  </Button>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>40 кредитов в месяц</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Генерация образов на аватаре</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Отцифровка больше 10 вещей</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Неограниченное общение с ИИ-стилистом</span>
                  </div>
                </div>
              </div>

              {/* Yearly Subscription */}
              <div className="border rounded-lg p-4 space-y-3 relative">
                <Badge className="absolute -top-2 left-4 bg-green-600">Выгодно</Badge>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">Pro год</div>
                    <div className="text-sm text-gray-600">
                      2 490 ₽/год
                      <span className="ml-2 text-green-600 font-medium">(экономия 1 098 ₽)</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleSubscribe("yearly")}
                    disabled={purchasing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Оформить
                  </Button>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>480 кредитов в год</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Все возможности Pro</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Credit Packs */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-center flex items-center justify-center gap-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              Купить кредиты
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {data?.creditPacks?.map((pack) => (
                <div key={pack.id} className="border rounded-lg p-3 text-center space-y-2">
                  <div className="font-medium">{pack.name}</div>
                  <div className="text-2xl font-bold text-blue-600">{pack.credits}</div>
                  <div className="text-sm text-gray-600">{pack.price_rub} ₽</div>
                  <Button size="sm" className="w-full" onClick={() => handleBuyCredits(pack.id)} disabled={purchasing}>
                    Купить
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Credit Usage Info */}
          <div className="text-xs text-gray-500 space-y-1 p-3 bg-gray-50 rounded-lg">
            <div className="font-medium mb-2">Стоимость действий:</div>
            <div>• Отцифровка вещи: 2 кредита</div>
            <div>• Генерация образа на аватаре: 3 кредита</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
