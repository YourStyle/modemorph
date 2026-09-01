"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"

interface FeatureCost {
  id: number
  feature_name: string
  display_name: string
  cost_credits: number
  cost_subscription_credits: number
  description: string
  is_active: boolean
  /** Себестоимость одного действия в рублях. Замеряется руками при смене
   *  модели; null означает «не замеряли», и тогда маржа не показывается. */
  unit_cost_rub: number | null
  /** Сколько включено в подписку помесячно. null — функция безлимитна. */
  included_monthly: number | null
  /** Ниже — досчитано бэкендом (feature_economics), не считать на клиенте:
   *  экран, который сам себе считает выручку, разойдётся с тем, что списывает
   *  код, и никто этого не заметит. */
  is_free: boolean
  revenue_rub_min: number | null
  revenue_rub_max: number | null
  margin_pct_min: number | null
  margin_pct_max: number | null
}

interface PlanEconomics {
  plan_type: string
  display_name: string
  price_rub: number
  monthly_rub: number
  included_cost_rub: number
  margin_pct: number | null
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
  const [creditPrice, setCreditPrice] = useState<{ min: number; max: number } | null>(null)
  const [planEconomics, setPlanEconomics] = useState<PlanEconomics[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

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
      const result = await api.get("/api/admin/feature-costs")
      setFeatureCosts(result.data || [])
      setCreditPrice(result.credit_price ?? null)
      setPlanEconomics(result.subscription || [])
    } catch (error) {
      console.error(error)
      toast({ title: "Ошибка", description: "Не удалось загрузить настройки стоимости", variant: "destructive" })
    }
  }

  const fetchCreditPacks = async () => {
    try {
      const result = await api.get("/api/admin/credit-packs")
      setCreditPacks(result.data || [])
    } catch (error) {
      console.error(error)
      toast({ title: "Ошибка", description: "Не удалось загрузить пакеты кредитов", variant: "destructive" })
    }
  }

  const fetchSubscriptionPricing = async () => {
    try {
      const result = await api.get("/api/admin/subscription-pricing")
      setSubscriptionPricing(result.data || [])
    } catch (error) {
      console.error(error)
      toast({ title: "Ошибка", description: "Не удалось загрузить цены подписок", variant: "destructive" })
    }
  }

  // Все три сохранения ходили голым fetch(), без заголовка Authorization.
  // Caddy отдаёт /api/* прямо в FastAPI, а там get_admin_user читает Bearer —
  // то есть ни одна правка на этой странице не доезжала: любое изменение цены
  // возвращало 401 и показывало «Не удалось обновить настройки». Прайс,
  // который нельзя было ни применить, ни даже сохранить.
  const updateFeatureCost = async (id: number, updates: Partial<FeatureCost>) => {
    setSaving(true)
    try {
      await api.patch('/api/admin/feature-costs', { id, updates })

      setFeatureCosts((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
      // Маржу считает бэкенд, а не этот экран. После сохранения перечитываем,
      // иначе цена обновится, а проценты рядом останутся от прежней.
      await fetchFeatureCosts()

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
      await api.patch('/api/admin/credit-packs', { id, updates })

      setCreditPacks((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
      // Цена пака задаёт рубли за кредит, а из них считается вся маржа ниже.
      await fetchFeatureCosts()

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
      await api.patch('/api/admin/subscription-pricing', { id, updates })

      setSubscriptionPricing((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
      // Цена плана — знаменатель в марже подписки.
      await fetchFeatureCosts()

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
        <h1 className="text-3xl font-bold tracking-tight">Управление ценами и стоимостью</h1>
        <p className="text-muted-foreground mt-2">Настройка цен подписок, пакетов кредитов и стоимости функций</p>
      </div>

      {/* Сводка. Стоит первой, потому что это единственный экран, где видно,
          зарабатывает ли продукт на том, что раздаёт. Все числа приходят с
          бэкенда посчитанными — здесь только отрисовка. */}
      <section>
        <h2 className="text-2xl font-bold mb-1">Экономика</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {creditPrice
            ? `Кредит стоит пользователю от ${creditPrice.min.toFixed(2)} ₽ до ${creditPrice.max.toFixed(2)} ₽ — зависит от пака. Маржа ниже дана вилкой: слева худший случай, по нему и решать.`
            : "Нет активных пакетов кредитов — считать выручку не из чего."}
        </p>

        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Функция</th>
                  <th className="pb-2 font-medium text-right">Себестоимость</th>
                  <th className="pb-2 font-medium text-right">Цена</th>
                  <th className="pb-2 font-medium text-right">Выручка</th>
                  <th className="pb-2 font-medium text-right">Маржа</th>
                  <th className="pb-2 font-medium text-right">В подписке</th>
                </tr>
              </thead>
              <tbody>
                {featureCosts.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2.5">{f.display_name}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {f.unit_cost_rub !== null
                        ? `${f.unit_cost_rub.toFixed(2)} ₽`
                        : <span className="text-muted-foreground">не замеряли</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {f.is_free ? <span className="text-muted-foreground">бесплатно</span> : `${f.cost_credits} кр`}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {f.revenue_rub_min !== null
                        ? `${f.revenue_rub_min.toFixed(2)} – ${f.revenue_rub_max?.toFixed(2)} ₽`
                        : "—"}
                    </td>
                    <td className={cn(
                      "py-2.5 text-right tabular-nums font-medium",
                      f.margin_pct_min !== null && f.margin_pct_min < 0 && "text-red-600",
                      f.margin_pct_min !== null && f.margin_pct_min >= 0 && f.margin_pct_min < 30 && "text-amber-600",
                    )}>
                      {f.margin_pct_min !== null ? `${f.margin_pct_min} – ${f.margin_pct_max}%` : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {f.included_monthly !== null && f.included_monthly !== undefined
                        ? `${f.included_monthly} / мес`
                        : <span className="text-muted-foreground">без лимита</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {planEconomics.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {planEconomics.map((p) => (
              <Card key={p.plan_type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{p.display_name || p.plan_type}</CardTitle>
                  <CardDescription>
                    {p.price_rub.toFixed(0)} ₽
                    {p.monthly_rub !== p.price_rub && ` — это ${p.monthly_rub.toFixed(2)} ₽ в месяц`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Стоит включённое в месяц</span>
                    <span className="tabular-nums">{p.included_cost_rub.toFixed(2)} ₽</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Маржа, если выбрать всё</span>
                    <span className={cn(
                      "tabular-nums font-semibold",
                      p.margin_pct !== null && p.margin_pct < 0 && "text-red-600",
                      p.margin_pct !== null && p.margin_pct >= 0 && p.margin_pct < 30 && "text-amber-600",
                    )}>
                      {p.margin_pct !== null ? `${p.margin_pct}%` : "—"}
                    </span>
                  </div>
                  {/* Худший случай, а не средний: столько останется, если
                      подписчик выберет все включённые лимиты до конца.
                      Реальный человек тратит меньше — но планировать надо по
                      тому, что он имеет право потратить. */}
                  <p className="text-xs text-muted-foreground pt-1">
                    Худший случай: подписчик выбирает все включённые лимиты. Сверх них всё продаётся за кредиты и приносит прибыль.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

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
              {/* Поле «Стоимость для подписчиков» убрано: подписчик не тратит
                  кредиты вообще — _is_subscriber() пропускает его мимо
                  тарификации. Число в этом поле никогда ни на что не влияло, а
                  выглядело как рычаг. Ровно из-за таких полей и появился баг,
                  который эта страница чинит. */}
              <div className="space-y-2">
                <Label htmlFor={`regular-${feature.id}`}>Стоимость (кредиты)</Label>
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
                <p className="text-sm text-muted-foreground">
                  {feature.is_active
                    ? feature.cost_credits === 0
                      ? "Бесплатно для всех."
                      : "Списывается только у тех, кто без подписки и уже израсходовал бесплатный лимит. Подписчик не платит кредитами."
                    : "Тарификация выключена — функция бесплатна."}
                </p>
              </div>

              {/* Себестоимость редактируется здесь, а не в коде: при смене
                  модели она меняется, и требовать деплой ради одного числа —
                  верный способ получить на экране устаревшую маржу. */}
              <div className="space-y-2">
                <Label htmlFor={`unit-cost-${feature.id}`}>Себестоимость одного действия, ₽</Label>
                <Input
                  id={`unit-cost-${feature.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="не замеряли"
                  defaultValue={feature.unit_cost_rub ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    const value = raw === "" ? null : Number.parseFloat(raw)
                    if (value !== null && Number.isNaN(value)) return
                    debouncedUpdate(
                      `unit-cost-${feature.id}`,
                      () => updateFeatureCost(feature.id, { unit_cost_rub: value }),
                    )
                  }}
                  disabled={saving}
                />
                <p className="text-sm text-muted-foreground">
                  Сколько мы платим за одно выполнение. Пусто — маржа не считается: ноль выглядел бы как ответ.
                </p>
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
