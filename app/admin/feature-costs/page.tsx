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
  description: string
  is_active: boolean
  /** Себестоимость одного действия в рублях. Замеряется руками при смене
   *  модели; null означает «не замеряли», и тогда маржа не показывается. */
  unit_cost_rub: number | null
  /** Потолок этой функции на каждом плане: {free: 5, monthly: 35, ...}. */
  caps: Record<string, number>
}

interface PlanIncluded {
  feature: string
  cap: number
  period: string
  unit_cost_rub: number
  included_cost_rub: number
}

interface PlanEconomics {
  plan_type: string
  display_name: string
  price_rub: number
  days: number | null
  included_cost_rub: number
  included: PlanIncluded[]
  unmeasured: string[]
  margin_pct: number | null
}

interface Promo {
  code: string
  percent_off: number
  plan_type: string | null
  expires_at: string | null
  max_uses: number | null
  is_active: boolean
  redeemed: number
  revenue_rub: number
}

interface DiscountSummary {
  kind: string
  issued: number
  used: number
  revenue_rub: number
}

interface SubscriptionPricing {
  id: number
  plan_type: string
  price_rub: number
  display_name: string
  description: string
  is_active: boolean
}

const PERIOD_RU: Record<string, string> = { week: "в неделю", month: "в месяц", once: "разово" }
const PLAN_RU: Record<string, string> = {
  free: "Бесплатный", weekly: "Недельный", monthly: "Месячный", yearly: "Годовой",
}
const PLAN_ORDER = ["free", "weekly", "monthly", "yearly"]

export default function FeatureCostsPage() {
  const [featureCosts, setFeatureCosts] = useState<FeatureCost[]>([])
  const [subscriptionPricing, setSubscriptionPricing] = useState<SubscriptionPricing[]>([])
  const [planEconomics, setPlanEconomics] = useState<PlanEconomics[]>([])
  const [freeLimits, setFreeLimits] = useState<Record<string, { cap: number; period: string }>>({})
  const [promos, setPromos] = useState<Promo[]>([])
  const [summary, setSummary] = useState<DiscountSummary[]>([])
  const [newPromo, setNewPromo] = useState({ code: "", percent_off: 20, max_uses: "", expires_at: "" })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Debounce timers for auto-save
  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Debounce function for auto-saving after user stops typing
  const debouncedUpdate = useCallback((key: string, updateFn: () => Promise<void>, delay = 1000) => {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key])
    }
    debounceTimersRef.current[key] = setTimeout(() => {
      updateFn()
    }, delay)
  }, [])

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    await Promise.all([fetchFeatureCosts(), fetchSubscriptionPricing(), fetchDiscounts()])
    setLoading(false)
  }

  const fetchFeatureCosts = async () => {
    try {
      const result = await api.get("/api/admin/feature-costs")
      setFeatureCosts(result.data || [])
      setPlanEconomics(result.plans || [])
      setFreeLimits(result.free_limits || {})
    } catch (error) {
      console.error(error)
      toast({ title: "Ошибка", description: "Не удалось загрузить настройки стоимости", variant: "destructive" })
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

  const fetchDiscounts = async () => {
    try {
      const result = await api.get("/api/admin/discounts")
      setPromos(result.promos || [])
      setSummary(result.summary || [])
    } catch (error) {
      console.error(error)
      toast({ title: "Ошибка", description: "Не удалось загрузить промокоды", variant: "destructive" })
    }
  }

  const createPromo = async () => {
    setSaving(true)
    try {
      await api.post("/api/admin/discounts", {
        code: newPromo.code,
        percent_off: newPromo.percent_off,
        max_uses: newPromo.max_uses ? Number.parseInt(newPromo.max_uses) : null,
        expires_at: newPromo.expires_at || null,
      })
      setNewPromo({ code: "", percent_off: 20, max_uses: "", expires_at: "" })
      await fetchDiscounts()
      toast({ title: "Готово", description: "Промокод создан" })
    } catch (error) {
      // Пол маржи отвечает словами и числами — показываем их, а не «ошибка».
      const raw = String((error as Error)?.message || "")
      const detail = raw.match(/"detail"\s*:\s*"([^"]+)"/)?.[1]
      toast({ title: "Не создан", description: detail || "Не удалось создать промокод", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const togglePromo = async (code: string, is_active: boolean) => {
    setSaving(true)
    try {
      await api.patch("/api/admin/discounts", { code, is_active })
      setPromos((prev) => prev.map((p) => (p.code === code ? { ...p, is_active } : p)))
    } catch (error) {
      console.error(error)
      toast({ title: "Ошибка", description: "Не удалось переключить код", variant: "destructive" })
    } finally {
      setSaving(false)
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
      await api.patch("/api/admin/feature-costs", { id, updates })
      setFeatureCosts((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
      // Маржу считает бэкенд, а не этот экран. После сохранения перечитываем,
      // иначе цена обновится, а проценты рядом останутся от прежней.
      await fetchFeatureCosts()
      toast({ title: "Успешно", description: "Настройки стоимости обновлены" })
    } catch (error) {
      console.error("Error updating feature cost:", error)
      toast({ title: "Ошибка", description: "Не удалось обновить настройки", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const updatePlanLimit = async (planType: string, feature: string, cap: number) => {
    setSaving(true)
    try {
      await api.patch("/api/admin/plan-limits", { planType, feature, cap })
      // Потолок — прямой множитель в себестоимости плана, пересчитываем.
      await fetchFeatureCosts()
      toast({ title: "Успешно", description: "Лимит обновлён" })
    } catch (error) {
      console.error("Error updating plan limit:", error)
      toast({ title: "Ошибка", description: "Не удалось обновить лимит", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const updateSubscriptionPricing = async (id: number, updates: Partial<SubscriptionPricing>) => {
    setSaving(true)
    try {
      await api.patch("/api/admin/subscription-pricing", { id, updates })
      setSubscriptionPricing((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
      // Цена плана — знаменатель в марже.
      await fetchFeatureCosts()
      toast({ title: "Успешно", description: "Цены подписки обновлены" })
    } catch (error) {
      console.error("Error updating subscription pricing:", error)
      toast({ title: "Ошибка", description: "Не удалось обновить цены", variant: "destructive" })
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

  const freeCost = Object.entries(freeLimits).reduce((sum, [feature, l]) => {
    const cost = featureCosts.find((f) => f.feature_name === feature)?.unit_cost_rub
    return sum + (cost ? l.cap * cost : 0)
  }, 0)

  return (
    <div className="container mx-auto p-6 space-y-12">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Тарифы и себестоимость</h1>
        <p className="text-muted-foreground mt-2">
          Цена плана, что в него входит и сколько это стоит нам
        </p>
      </div>

      {/* Сводка. Стоит первой, потому что это единственный экран, где видно,
          зарабатывает ли продукт на том, что раздаёт. Все числа приходят с
          бэкенда посчитанными — здесь только отрисовка. */}
      <section>
        <h2 className="text-2xl font-bold mb-1">Экономика планов</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Худший случай: человек выбирает каждый потолок до конца. Медиана вчетверо ниже,
          но решать цену надо по худшему случаю. Сверх потолка функция просто не работает —
          второй валюты, за которую можно продолжить, больше нет.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {planEconomics.map((p) => (
            <Card key={p.plan_type}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{p.display_name || PLAN_RU[p.plan_type] || p.plan_type}</CardTitle>
                <CardDescription>
                  {p.price_rub.toFixed(0)} ₽ за {p.days ?? "?"} дн.
                  {p.plan_type === "yearly" && ` — это ${(p.price_rub / 12).toFixed(0)} ₽ в месяц`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {p.included.map((line) => (
                  <div key={line.feature} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {featureCosts.find((f) => f.feature_name === line.feature)?.display_name || line.feature}
                      {" · "}
                      {line.cap} {PERIOD_RU[line.period]}
                    </span>
                    <span className="tabular-nums">{line.included_cost_rub.toFixed(2)} ₽</span>
                  </div>
                ))}
                {p.unmeasured.length > 0 && (
                  <div className="text-xs text-amber-600">
                    Не замерена себестоимость: {p.unmeasured.join(", ")}
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Стоит включённое</span>
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
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Бесплатный тариф — не план, у него нет выручки. Но он есть расход на
            каждую регистрацию, и это единственное место, где его видно. */}
        {Object.keys(freeLimits).length > 0 && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Бесплатный тариф</CardTitle>
              <CardDescription>
                Выдаётся разово и навсегда. {freeCost.toFixed(2)} ₽ расхода на каждую регистрацию.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      {/* Лимиты планов — то, что раньше было пакетами кредитов. */}
      <section>
        <h2 className="text-2xl font-bold mb-1">Что входит в тариф</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Потолок на период. Пусто — функция на этом плане безлимитна.
        </p>
        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Функция</th>
                  <th className="pb-2 font-medium text-right">Себестоимость</th>
                  {PLAN_ORDER.map((plan) => (
                    <th key={plan} className="pb-2 font-medium text-right">{PLAN_RU[plan]}</th>
                  ))}
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
                    {PLAN_ORDER.map((plan) => (
                      <td key={plan} className="py-2.5 text-right">
                        {f.caps?.[plan] === undefined ? (
                          <span className="text-muted-foreground text-xs">без лимита</span>
                        ) : (
                          <Input
                            className="w-20 ml-auto text-right tabular-nums"
                            type="number"
                            min="0"
                            defaultValue={f.caps[plan]}
                            onChange={(e) => {
                              const value = Number.parseInt(e.target.value)
                              if (Number.isNaN(value) || value < 0) return
                              debouncedUpdate(
                                `cap-${plan}-${f.feature_name}`,
                                () => updatePlanLimit(plan, f.feature_name, value),
                              )
                            }}
                            disabled={saving}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Subscription Pricing Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Цены тарифов</h2>
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
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor={`price-${pricing.id}`}>Цена (₽)</Label>
                  <Input
                    id={`price-${pricing.id}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pricing.price_rub}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, "")
                      const numValue = value === "" ? 0 : Number.parseInt(value)
                      setSubscriptionPricing((prev) =>
                        prev.map((item) => (item.id === pricing.id ? { ...item, price_rub: numValue } : item))
                      )
                      debouncedUpdate(
                        `sub-price-${pricing.id}`,
                        () => updateSubscriptionPricing(pricing.id, { price_rub: numValue })
                      )
                    }}
                    disabled={saving}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {pricing.plan_type === "yearly" && `≈ ${Math.round(pricing.price_rub / 12)} ₽ в месяц`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Промокоды */}
      <section>
        <h2 className="text-2xl font-bold mb-1">Промокоды</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Скидка проверяется против пола маржи при создании: код, который продаёт тариф ниже
          себестоимости, не создастся. Рефералки и разовые предложения выдаются автоматически и
          в списке не показываются — по ним сводка ниже.
        </p>

        <Card className="mb-4">
          <CardContent className="pt-6 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="promo-code">Код</Label>
              <Input id="promo-code" className="w-40 uppercase" value={newPromo.code}
                onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="promo-pct">Скидка, %</Label>
              <Input id="promo-pct" className="w-24" type="number" min="1" max="100" value={newPromo.percent_off}
                onChange={(e) => setNewPromo({ ...newPromo, percent_off: Number.parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="promo-uses">Применений</Label>
              <Input id="promo-uses" className="w-28" type="number" min="1" placeholder="без лимита"
                value={newPromo.max_uses} onChange={(e) => setNewPromo({ ...newPromo, max_uses: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="promo-exp">Действует до</Label>
              <Input id="promo-exp" className="w-44" type="date" value={newPromo.expires_at}
                onChange={(e) => setNewPromo({ ...newPromo, expires_at: e.target.value })} />
            </div>
            <Button onClick={createPromo} disabled={saving || !newPromo.code}>Создать</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Код</th>
                  <th className="pb-2 font-medium text-right">Скидка</th>
                  <th className="pb-2 font-medium text-right">Применений</th>
                  <th className="pb-2 font-medium text-right">Выручка</th>
                  <th className="pb-2 font-medium text-right">До</th>
                  <th className="pb-2 font-medium text-right">Активен</th>
                </tr>
              </thead>
              <tbody>
                {promos.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-muted-foreground">Промокодов пока нет</td></tr>
                )}
                {promos.map((p) => (
                  <tr key={p.code} className="border-b last:border-0">
                    <td className="py-2.5 font-mono">{p.code}</td>
                    <td className="py-2.5 text-right tabular-nums">−{p.percent_off}%</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {p.redeemed}{p.max_uses ? ` / ${p.max_uses}` : ""}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{p.revenue_rub} ₽</td>
                    <td className="py-2.5 text-right text-muted-foreground">
                      {p.expires_at ? new Date(p.expires_at).toLocaleDateString("ru") : "бессрочно"}
                    </td>
                    <td className="py-2.5 text-right">
                      <Switch checked={p.is_active}
                        onCheckedChange={(checked) => togglePromo(p.code, checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Гипотеза 2 живёт этой строкой: выдано предложений против оплаченных. */}
        {summary.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {summary.map((s) => (
              <Card key={s.kind}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {s.kind === "referral" ? "Реферальные коды" : "Разовые предложения"}
                  </CardTitle>
                  <CardDescription>
                    {s.kind === "referral"
                      ? "Выдаются при первом заходе в профиль"
                      : "Выдаются в момент, когда кончился бесплатный лимит (половине — контрольная группа)"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Выдано</span>
                    <span className="tabular-nums">{s.issued}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Закончились оплатой</span>
                    <span className="tabular-nums">
                      {s.used} {s.issued > 0 && `(${Math.round(100 * s.used / s.issued)}%)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Принесли</span>
                    <span className="tabular-nums">{s.revenue_rub} ₽</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Feature Costs Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Себестоимость функций</h2>
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
                {/* Поле «Стоимость (кредиты)» убрано вместе с кредитами. Что
                    функция стоит человеку, теперь определяет не её ценник, а
                    потолок в тарифе — он редактируется выше. */}
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
                    Сколько мы платим за одно выполнение. Оцифровка считается ЗА ФОТО, а не за
                    вещь: генерация идёт сеткой 2×2, и кадр стоит одинаково с одной вещью и с
                    четырьмя. Пусто — маржа не считается: ноль выглядел бы как ответ.
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
