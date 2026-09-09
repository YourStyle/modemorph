"use client"

import { useState, useEffect, useRef } from "react"
import { useSheetDrag } from "@/hooks/use-sheet-drag"
import { Sheet, SheetPortal } from "@/components/ui/sheet"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { startRoboPayment } from "@/lib/payments"
import { toast } from "@/hooks/use-toast"
import { api } from "@/lib/api-client"

type Plan = "yearly" | "monthly" | "weekly"

interface SubscriptionSheetProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  variant?: "limitReached" | "explore" // limitReached = "У тебя закончились лимиты", explore = апселл
  /** Where the paywall was triggered from (e.g. "limit:vton_used", "limit:outfits_saved").
   *  Logged with the paywall_shown event so conversions can be attributed to the
   *  feature that blocked the user. Optional — defaults to the variant. */
  source?: string
}

interface PlanLimit {
  cap: number
  period: "once" | "week" | "month"
  remaining?: number
  renews_at?: string | null
}

interface SubscriptionPlan {
  plan_type: string
  price_rub: number
  display_name: string
  limits: Record<string, PlanLimit>
}

// Что писать про потолок. Только функции, которые чего-то стоят: ставить
// «300 запросов к стилисту» рядом с «35 оцифровок» — значит уравнять 108 ₽ и 12 ₽.
const LIMIT_LABEL: Record<string, (n: number) => string> = {
  wardrobe_items_anlyzed: (n) => `${n} фото на оцифровку`,
  vton_used: (n) => `${n} примерок`,
  ai_requests: (n) => `${n} запросов к стилисту`,
}
const PERIOD_RU: Record<string, string> = { week: "в неделю", month: "в месяц", once: "" }

export function SubscriptionSheet({ isOpen, onClose, onSuccess, variant = "limitReached", source }: SubscriptionSheetProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly")
  const [isProcessing, setIsProcessing] = useState(false)
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [currentSub, setCurrentSub] = useState<{ subscription_type: string; status: string; expires_at: string | null } | null>(null)
  const [currentLimits, setCurrentLimits] = useState<Record<string, PlanLimit>>({})
  // Скидки. `offer` — личное предложение, выданное сервером в момент, когда
  // кончился бесплатный лимит; его код подставляется сам. `promo` — то, что
  // человек ввёл руками. `applied` — ответ сервера с посчитанной ценой: считать
  // её здесь нельзя, платит-то Робокасса по сумме, которую назвал бэкенд.
  const [offer, setOffer] = useState<{ code: string; percent_off: number; expires_at: string | null } | null>(null)
  const [promo, setPromo] = useState("")
  const [applied, setApplied] = useState<{ code: string; percent_off: number; discounted_rub: number } | null>(null)
  const [promoError, setPromoError] = useState("")
  const [now, setNow] = useState(() => Date.now())

  // Swipe-to-dismiss states
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      fetchPricing()
      api.get("/api/user-subscription")
        .then((d) => {
          setCurrentSub(d?.subscription || null)
          setCurrentLimits(d?.limits || {})
        })
        .catch(() => setCurrentSub(null))
      api.get("/api/discounts/mine")
        .then((d) => {
          setOffer(d?.offer || null)
          if (d?.offer?.code) setPromo(d.offer.code)
        })
        .catch(() => setOffer(null))
    }
  }, [isOpen])

  // Тикаем раз в секунду только пока шторка открыта и таймеру есть что
  // показывать. Интервал, который живёт всегда, — это перерисовка всего
  // приложения раз в секунду ради экрана, которого никто не видит.
  useEffect(() => {
    if (!isOpen || !offer?.expires_at) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [isOpen, offer?.expires_at])

  // Код проверяется на сервере при каждой смене тарифа: скидка может быть
  // привязана к одному плану, и «−25%» рядом с недельным ничего не значит,
  // если код только на годовой.
  useEffect(() => {
    const code = promo.trim()
    if (!isOpen || !code) {
      setApplied(null)
      setPromoError("")
      return
    }
    let cancelled = false
    api.post("/api/discounts/check", { code, planType: selectedPlan })
      .then((d) => {
        if (cancelled) return
        setApplied({ code: d.code, percent_off: d.percent_off, discounted_rub: d.discounted_rub })
        setPromoError("")
      })
      .catch((e) => {
        if (cancelled) return
        setApplied(null)
        // Бэкенд объясняет причину словами («срок истёк», «уже применяли»),
        // и это единственное, что человеку помогает. api-client кладёт тело
        // ответа в message целиком — достаём detail оттуда, а не показываем
        // одинаковое «код недействителен» на все случаи.
        const raw = String(e?.message || "")
        const detail = raw.match(/"detail"\s*:\s*"([^"]+)"/)?.[1]
        setPromoError(detail || (raw.includes("400") ? "Код не подошёл" : ""))
      })
    return () => { cancelled = true }
  }, [promo, selectedPlan, isOpen])

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

  // Is the user already subscribed? (so we say "Продлить", not "Получить доступ")
  const subActive = !!currentSub && currentSub.status === "active" &&
    (!currentSub.expires_at || new Date(currentSub.expires_at) > new Date())

  // Функция, из-за которой открылся пейволл: source приходит как "limit:vton_used".
  const blockedFeature = source?.startsWith("limit:") ? source.slice("limit:".length) : null
  const renewsAt = blockedFeature ? currentLimits[blockedFeature]?.renews_at : null
  const renewsLabel = renewsAt
    ? new Date(renewsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    : ""

  const title = variant !== "limitReached"
    ? "Открой для себя больше"
    : subActive
      ? "Включённое в тариф закончилось"
      : "У тебя закончились лимиты"

  // Подписчику, упёршемуся в потолок, врать про «оформи подписку» нельзя — она у
  // него уже есть. Раньше здесь предлагали докупить кредиты; теперь честный
  // ответ — дата, когда лимит нальётся заново, и возможность взять тариф шире.
  const subtitle = variant !== "limitReached"
    ? "Выбери подходящий тариф"
    : subActive
      ? renewsLabel
        ? `Лимит обновится ${renewsLabel}`
        : "Лимит обновится в начале следующего периода"
      : "Выбери тариф — лимиты откроются сразу"

  const subExpiresLabel = currentSub?.expires_at
    ? new Date(currentSub.expires_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : ""

  // Сколько осталось от личного предложения. Пусто, когда истекло — тогда и
  // баннер не рисуется, а не показывает «00:00:00».
  const countdown = (() => {
    if (!offer?.expires_at) return ""
    const left = new Date(offer.expires_at).getTime() - now
    if (left <= 0) return ""
    const h = Math.floor(left / 3_600_000)
    const m = Math.floor((left % 3_600_000) / 60_000)
    const s = Math.floor((left % 60_000) / 1000)
    return h > 0 ? `${h} ч ${m} мин` : `${m}:${String(s).padStart(2, "0")}`
  })()

  const handleGetAccess = async () => {
    setIsProcessing(true)
    try {
      const plan = getSelectedPlanData()
      if (!plan) {
        toast({
          title: "Ошибка",
          description: "Тариф не найден",
          variant: "destructive",
        })
        return
      }
      await startRoboPayment(
        applied?.discounted_rub ?? plan.price_rub,
        `Подписка ${plan.display_name}`,
        // Сумму всё равно пересчитает бэкенд по коду — здесь она только для
        // логов. Клиент выбирает ЧТО купить и ПО КАКОМУ коду, но не почём.
        { action: "subscribe", type: selectedPlan, ...(applied ? { code: applied.code } : {}) }
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

  // Тот же жест, что у CommonSheet: буфер перед стартом, тянуть можно и за
  // контент, пока он на самом верху. Раньше здесь лежала своя копия логики,
  // ограниченная 28px ручки.
  const { dragY, isDragging, handlers } = useSheetDrag({
    isOpen,
    scrollRef,
    onDismiss: onClose,
  })

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
            "fixed z-50 inset-x-0 bottom-0 rounded-t-[28px] border-0 p-0 bg-canvas transition-all duration-300 overflow-hidden shadow-[0_-4px_24px_rgba(0,0,0,0.12),0_-1px_4px_rgba(0,0,0,0.04)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "h-[72vh]"
          )}
          style={{
            transform: `translateY(${dragY}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          {...handlers}
          onInteractOutside={(e) => e.preventDefault()}
        >
        {/* Стеклянная шапка (LIQUID_GLASS.md, уровень 1) — только ручка.
            Тело ниже — плотный холст, там блюрить нечего. */}
        <div className="sheet-drag-zone glass relative will-change-transform">
          {/* Drag handle */}
          <div className="drag-handle flex justify-center py-3 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-ink/15" />
          </div>
        </div>

        <div ref={scrollRef} className="px-6 pb-6 h-full flex flex-col text-ink overflow-y-auto overscroll-contain">
          <div className="flex flex-col h-full space-y-4">
            {/* Header */}
            <div className="text-center space-y-1 pt-2 flex-shrink-0">
              <h2 className="text-h2 text-ink">
                {title}
              </h2>
              <p className="text-body text-ink-2">
                {subtitle}
              </p>
            </div>

            {subActive && (
              <div className="flex-shrink-0 rounded-2xl bg-canvas-sunk text-ink text-caption px-3 py-2 text-center">
                Подписка активна{subExpiresLabel ? ` до ${subExpiresLabel}` : ""}. Покупка продлит её.
              </div>
            )}

            {/* Личное предложение. Таймер считает от даты, которую выдал сервер,
                а не от момента открытия шторки: иначе перезагрузка продлевала бы
                акцию, и срочность была бы враньём. */}
            {offer && countdown && (
              <div className="flex-shrink-0 rounded-2xl bg-ink text-signal-ink px-3 py-2.5 text-center">
                <div className="text-caption font-semibold">
                  −{offer.percent_off}% на любой тариф
                </div>
                <div className="text-micro opacity-80 mt-0.5">
                  Предложение сгорает через {countdown}
                </div>
              </div>
            )}

            {/* Plan selection */}
            <div className="space-y-2 flex-shrink-0">
              {loading ? (
                <div className="text-center py-8 text-body text-ink-2">Загрузка...</div>
              ) : (
                subscriptionPlans.map((plan) => {
                  const key = plan.plan_type as Plan
                  const isSelected = selectedPlan === key
                  // Состав тарифа приезжает вместе с ценой из /api/pricing, а не
                  // переписан здесь руками: пейволл обязан обещать ровно те
                  // цифры, по которым бэкенд потом откажет.
                  const included = Object.entries(plan.limits || {})
                    .filter(([f]) => f in LIMIT_LABEL)
                    .map(([f, l]) => `${LIMIT_LABEL[f](l.cap)} ${PERIOD_RU[l.period] || ""}`.trim())
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedPlan(key)}
                      className={cn(
                        "w-full p-3 rounded-2xl bg-canvas-sunk transition-transform duration-press ease-out active:scale-[.99] relative border-2 text-left",
                        isSelected ? "border-ink" : "border-transparent"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-body text-ink">{plan.display_name}</div>
                          <div className="text-caption text-ink-2 mt-0.5">
                            {included.join(" · ")}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {/* Скидка показывается только на выбранном тарифе:
                              сервер считает её под конкретный план, и рисовать
                              её на остальных значило бы обещать непроверенное. */}
                          {isSelected && applied ? (
                            <>
                              <div className="font-bold text-body text-ink">
                                {applied.discounted_rub} ₽
                              </div>
                              <div className="text-caption text-ink-2 line-through">
                                {plan.price_rub} ₽
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="font-bold text-body text-ink">
                                {key === "yearly"
                                  ? `${Math.round(plan.price_rub / 12)} ₽`
                                  : `${plan.price_rub} ₽`
                                }
                              </div>
                              <div className="text-caption text-ink-2">
                                {key === "yearly"
                                  ? `в месяц · ${plan.price_rub} ₽ за год`
                                  : key === "weekly" ? "в неделю" : "в месяц"}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Промокод. Поле стоит после тарифов, а не над ними: человек,
                у которого кода нет, не должен думать, что без кода сюда
                заходить рано. */}
            <div className="flex-shrink-0">
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
                placeholder="Промокод"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className={cn(
                  "w-full h-11 px-4 rounded-2xl bg-canvas-sunk text-body text-ink placeholder:text-ink-3 outline-none border-2 transition-colors",
                  applied ? "border-ink" : promoError ? "border-signal" : "border-transparent"
                )}
              />
              {applied && (
                <p className="text-caption text-ink-2 mt-1.5 px-1">
                  Код применён: −{applied.percent_off}%
                </p>
              )}
              {!applied && promoError && (
                <p className="text-caption text-signal mt-1.5 px-1">{promoError}</p>
              )}
            </div>

            {/* Bottom section - fixed at bottom */}
            <div className="space-y-3 flex-shrink-0 mt-auto">
              {/* Get Access button */}
              <Button
                onClick={handleGetAccess}
                disabled={isProcessing}
                className="w-full h-12 text-body font-semibold rounded-full bg-ink text-signal-ink border-0 hover:bg-ink/90"
              >
                {isProcessing ? "Обработка..." : subActive ? "Сменить тариф" : "Получить доступ"}
              </Button>

              {/* Continue free button */}
              <button
                onClick={handleContinueFree}
                className="w-full text-center text-caption text-ink hover:text-ink-2 transition-colors font-medium"
              >
                {subActive ? "Подождать обновления лимита" : "Продолжить бесплатно"}
              </button>
            </div>
          </div>
        </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  )
}
