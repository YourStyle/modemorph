"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

interface FeatureCost {
  id: number
  feature_name: string
  display_name: string
  cost_credits: number
  cost_subscription_credits: number
  description: string
  is_active: boolean
}

interface CreditPack {
  id: number
  name: string
  credits: number
  price_rub: number
  is_active: boolean
}

interface SubscriptionPricing {
  id: number
  plan_type: string
  price_rub: number
  credits: number
  display_name: string
  description: string
  is_active: boolean
}

export default function FeatureCostsPage() {
  const [featureCosts, setFeatureCosts] = useState<FeatureCost[]>([])
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([])
  const [subscriptionPricing, setSubscriptionPricing] = useState<SubscriptionPricing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const supabase = createClient() // Still needed for fetching data

  // Debounce timers for auto-save
  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Debounce function for auto-saving after user stops typing
  const debouncedUpdate = useCallback((key: string, updateFn: () => Promise<void>, delay = 1000) => {
    // Clear existing timer for this field
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key])
    }

    // Set new timer
    debounceTimersRef.current[key] = setTimeout(() => {
      updateFn()
    }, delay)
  }, [])

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    await Promise.all([
      fetchFeatureCosts(),
      fetchCreditPacks(),
      fetchSubscriptionPricing(),
    ])
    setLoading(false)
  }

  const fetchFeatureCosts = async () => {
    try {
      const { data, error } = await supabase.from("feature_costs").select("*").order("feature_name")
      if (error) throw error
      setFeatureCosts(data || [])
    } catch (error) {
      console.error(error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить настройки стоимости",
        variant: "destructive",
      })
    }
  }

  const fetchCreditPacks = async () => {
    try {
      const { data, error } = await supabase.from("credit_packs").select("*").order("credits")
      if (error) throw error
      setCreditPacks(data || [])
    } catch (error) {
      console.error(error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить пакеты кредитов",
        variant: "destructive",
      })
    }
  }

  const fetchSubscriptionPricing = async () => {
    try {
      const { data, error } = await supabase.from("subscription_pricing").select("*").order("plan_type")
      if (error) throw error
      setSubscriptionPricing(data || [])
    } catch (error) {
      console.error(error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить цены подписок",
        variant: "destructive",
      })
    }
  }

  const updateFeatureCost = async (id: number, updates: Partial<FeatureCost>) => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/feature-costs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update')
      }

      setFeatureCosts((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))

      toast({
        title: "Успешно",
        description: "Настройки стоимости обновлены",
      })
    } catch (error) {
      console.error("Error updating feature cost:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось обновить настройки",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const updateCreditPack = async (id: number, updates: Partial<CreditPack>) => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/credit-packs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update')
      }

      setCreditPacks((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))

      toast({
        title: "Успешно",
        description: "Пакет кредитов обновлен",
      })
    } catch (error) {
      console.error("Error updating credit pack:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось обновить пакет",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const updateSubscriptionPricing = async (id: number, updates: Partial<SubscriptionPricing>) => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/subscription-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update')
      }

      setSubscriptionPricing((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))

      toast({
        title: "Успешно",
        description: "Цены подписки обновлены",
      })
    } catch (error) {
      console.error("Error updating subscription pricing:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось обновить цены",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Загрузка...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-12">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Управление ценами и стоимостью</h1>
        <p className="text-muted-foreground mt-2">Настройка цен подписок, пакетов кредитов и стоимости функций</p>
      </div>

      {/* Subscription Pricing Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Цены подписок</h2>
        <div className="grid gap-4">
          {subscriptionPricing.map((pricing) => (
            <Card key={pricing.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{pricing.display_name}</CardTitle>
                    <CardDescription>{pricing.description}</CardDescription>
                  </div>
                  <Switch
                    checked={pricing.is_active}
                    onCheckedChange={(checked) => updateSubscriptionPricing(pricing.id, { is_active: checked })}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`price-${pricing.id}`}>Цена (₽)</Label>
                    <Input
                      id={`price-${pricing.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pricing.price_rub}
                      onChange={(e) => {
                        // Allow only numbers
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        const numValue = value === '' ? 0 : Number.parseInt(value)

                        // Update local state immediately
                        setSubscriptionPricing((prev) =>
                          prev.map((item) =>
                            item.id === pricing.id ? { ...item, price_rub: numValue } : item
                          )
                        )

                        // Debounce the database update
                        debouncedUpdate(
                          `sub-price-${pricing.id}`,
                          () => updateSubscriptionPricing(pricing.id, { price_rub: numValue })
                        )
                      }}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`credits-${pricing.id}`}>Кредиты в подписке</Label>
                    <Input
                      id={`credits-${pricing.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pricing.credits}
                      onChange={(e) => {
                        // Allow only numbers
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        const numValue = value === '' ? 0 : Number.parseInt(value)

                        // Update local state immediately
                        setSubscriptionPricing((prev) =>
                          prev.map((item) =>
                            item.id === pricing.id ? { ...item, credits: numValue } : item
                          )
                        )

                        // Debounce the database update
                        debouncedUpdate(
                          `sub-credits-${pricing.id}`,
                          () => updateSubscriptionPricing(pricing.id, { credits: numValue })
                        )
                      }}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {pricing.plan_type === 'yearly' && `≈ ${Math.round(pricing.price_rub / 12)} ₽ в месяц`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Credit Packs Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Пакеты кредитов</h2>
        <div className="grid gap-4">
          {creditPacks.map((pack) => (
            <Card key={pack.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{pack.name}</CardTitle>
                  <Switch
                    checked={pack.is_active}
                    onCheckedChange={(checked) => updateCreditPack(pack.id, { is_active: checked })}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`pack-name-${pack.id}`}>Название</Label>
                    <Input
                      id={`pack-name-${pack.id}`}
                      value={pack.name}
                      onChange={(e) => updateCreditPack(pack.id, { name: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pack-credits-${pack.id}`}>Кредиты</Label>
                    <Input
                      id={`pack-credits-${pack.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pack.credits}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        const numValue = value === '' ? 0 : Number.parseInt(value)

                        setCreditPacks((prev) =>
                          prev.map((item) =>
                            item.id === pack.id ? { ...item, credits: numValue } : item
                          )
                        )

                        debouncedUpdate(
                          `pack-credits-${pack.id}`,
                          () => updateCreditPack(pack.id, { credits: numValue })
                        )
                      }}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pack-price-${pack.id}`}>Цена (₽)</Label>
                    <Input
                      id={`pack-price-${pack.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pack.price_rub}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        const numValue = value === '' ? 0 : Number.parseInt(value)

                        setCreditPacks((prev) =>
                          prev.map((item) =>
                            item.id === pack.id ? { ...item, price_rub: numValue } : item
                          )
                        )

                        debouncedUpdate(
                          `pack-price-${pack.id}`,
                          () => updateCreditPack(pack.id, { price_rub: numValue })
                        )
                      }}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {pack.credits > 0 && `≈ ${(pack.price_rub / pack.credits).toFixed(1)} ₽ за кредит`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Feature Costs Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Стоимость функций</h2>
        <div className="grid gap-6">
        {featureCosts.map((feature) => (
          <Card key={feature.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{feature.display_name}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </div>
                <Switch
                  checked={feature.is_active}
                  onCheckedChange={(checked) => updateFeatureCost(feature.id, { is_active: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`regular-${feature.id}`}>Стоимость для обычных пользователей (кредиты)</Label>
                  <Input
                    id={`regular-${feature.id}`}
                    type="number"
                    min="0"
                    value={feature.cost_credits}
                    onChange={(e) =>
                      updateFeatureCost(feature.id, {
                        cost_credits: Number.parseInt(e.target.value) || 0,
                      })
                    }
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`subscription-${feature.id}`}>Стоимость для подписчиков (кредиты)</Label>
                  <Input
                    id={`subscription-${feature.id}`}
                    type="number"
                    min="0"
                    value={feature.cost_subscription_credits}
                    onChange={(e) =>
                      updateFeatureCost(feature.id, {
                        cost_subscription_credits: Number.parseInt(e.target.value) || 0,
                      })
                    }
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`description-${feature.id}`}>Описание</Label>
                <Textarea
                  id={`description-${feature.id}`}
                  value={feature.description}
                  onChange={(e) => updateFeatureCost(feature.id, { description: e.target.value })}
                  disabled={saving}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
      </section>
    </div>
  )
}
