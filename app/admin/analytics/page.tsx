"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
// No ReferenceLine here: the only measurement break on this dashboard belongs
// to `active_users`, which this page does not plot. See the timeline chart.
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TrendingUp, Target, Zap, CreditCard, Loader2, Sparkles, CheckCircle2, Download, DollarSign, AlertTriangle, Lock } from "lucide-react"
import * as XLSX from "xlsx"

/** Any metric the backend could not honestly compute arrives as null. */
type Num = number | null

interface AnalyticsData {
  _errors: Array<{ metric: string; error: string }>
  meta: {
    excludes_test_accounts: boolean
    test_accounts_excluded: Num
    /**
     * TWO populations, and they are not interchangeable.
     * `accounts` — everyone who authenticated (a row in `users`): 455 on prod.
     * `profiles_with_data` — everyone who then submitted the profile form
     * (a row in `user_profiles`): 295.
     * The 160-account gap is the biggest single drop in the product. Any
     * caption that says «зарегистрированных» must say which of the two it
     * means; every rate below divides by `profiles_with_data`.
     */
    accounts: Num
    profiles_with_data: Num
    accounts_without_profile: Num
    population_note: string
    /** @deprecated alias of `profiles_with_data` — never the account count. */
    total_users: Num
    activity_cutoff: string
    rec_instrumentation_since: string
  }
  onboarding: {
    users_with_first_item: Num
    users_wardrobe_15: Num
    users_wardrobe_25: Num
    users_wardrobe_50: Num
  }
  ahaMoment: {
    users_first_outfit: Num
    users_first_tryon: Num
    users_clicked_recommendation: Num
  }
  recommendations: {
    served_rows: Num
    served_sessions: Num
    served_users: Num
    impressions: Num
    impression_sessions: Num
    impression_users: Num
    clicks: Num
    click_users: Num
    ctr: Num
    ctr_basis: { sessions: Num; impressions: Num; clicks: Num }
    ctr_min_impressions: number
    instrumentation_since: string
  }
  value: {
    total_outfits_saved: Num
    users_saved_outfits: Num
    repeat_task_rate: Num
    outfits_per_active_user: Num
  }
  engagement: {
    users_used_ai: Num
    total_ai_requests: Num
    ai_adoption_pct: Num
    /** Which population the pct divides by, and its size. Render both. */
    ai_adoption_basis: string
    ai_adoption_denominator: Num
    ai_users_who_saved_look: Num
    ai_users_who_saved_look_pct: Num
  }
  retention: {
    d1_retention: Num
    d7_retention: Num
    d30_retention: Num
    d1_users: Num
    d7_users: Num
    d30_users: Num
    eligible_d1: Num
    eligible_d7: Num
    eligible_d30: Num
    measurement: {
      cutoff: string
      instrumented_users: Num
      /** Profiles — an account without one cannot produce a daily_user_activity
       *  row at all, so it is not a candidate for instrumentation. */
      denominator: Num
      denominator_basis: string
      accounts: Num
      /** @deprecated alias of `denominator`. */
      total_users: Num
      coverage_pct: Num
      basis: string
    }
  }
  monetization: {
    paywall_shown: Num
    paid_subscriptions: Num
    /** Active subscriptions, split by provenance. `premium_users` is the total;
     *  `premium_granted` are rows written by /grant-credits and /gift, which are
     *  not revenue. Never render the total without the split beside it. */
    premium_users: Num
    premium_paid: Num
    premium_granted: Num
    conversion_rate: Num
    conversion_overlap_days: Num
    paywall_window: [string, string]
    paid_window: [string, string]
  }
  paymentFunnel: {
    attempts: Num
    pending: Num
    paid: Num
    users_attempted: Num
    users_paid: Num
    paid_pct: Num
    /** Invoices with no confirmed payment / attempts. NOT a drop-off rate —
     *  see status_caveat: payments has no failure status. */
    unconfirmed_pct: Num
    total_revenue: Num
    by_month: Array<{
      month: string
      attempts: number
      pending: number
      paid: number
      users: number
      revenue: number
      paid_pct: Num
      unconfirmed_pct: Num
    }>
    status_caveat: {
      statuses_observed: string[]
      /** true once a provider callback writes a terminal failure status; only
       *  then may this block use the word «отвал». */
      has_failure_status: boolean
      unconfirmed_label: string
      reason: string
      unblocks_when: string
    }
  }
  revenue: {
    mrr: Num
    total_revenue: Num
    paying_users: Num
    arpu: Num
    arppu: Num
  } | null
  revenueGate: {
    payers: Num
    required: number
    unlocked: boolean
    removed_metrics: string[]
    gated_metrics: string[]
    gated_reason: string
    shown_anyway: string[]
    shown_anyway_reason: string
  }
  funnel: Array<{
    stage: string
    /** Completed this stage AND every stage above it. This is the bar. */
    users: Num
    /** Did this action at all, by any path. */
    total: Num
    conv_from_prev_pct: Num
    conv_from_start_pct: Num
    off_path: Num
  }>
  funnelMeta: {
    basis: string
    /** "accounts" — the funnel starts at authentication, not at the profile. */
    starts_at: string
    description: string
    excluded_stages: string[]
    excluded_reason: string
  }
  timeline: Array<{
    date: string
    items_added: number
    outfits_created: number
    ai_requests: number
    registrations: number
    active_users: number
  }>
  timelineMeta: {
    from: string | null
    to: string | null
    days: number
    zero_filled: boolean
  }
  stickiness: {
    dau: Num
    mau: Num
    /** null while the MAU window still crosses `cutoff` — the numerator and the
     *  denominator come from two different instruments until then. */
    ratio: Num
    ratio_suppressed: boolean
    ratio_suppressed_reason: string | null
    mau_window_start: string | null
    avg_days_active: Num
    dau_is_partial: boolean
    cutoff: string
  }
  cohortRetention: Array<{
    week: string
    cohort_size: number
    low_sample: boolean
    /** Non-null when the cells are suppressed; says why, in the payload, so the
     *  table and the workbook give the same reason. */
    suppressed_reason: string | null
    week_1: Num; week_1_pct: Num; week_1_elapsed: boolean
    week_2: Num; week_2_pct: Num; week_2_elapsed: boolean
    week_3: Num; week_3_pct: Num; week_3_elapsed: boolean
    week_4: Num; week_4_pct: Num; week_4_elapsed: boolean
  }>
  cohortMinSize: number
  activation: Array<{
    action: string
    did_total: Num
    did_retained: Num
    did_retention_pct: Num
    didnt_total: Num
    didnt_retained: Num
    didnt_retention_pct: Num
  }>
  timeToValue: {
    avg_to_first_item_hours: Num
    median_to_first_item_hours: Num
    avg_to_first_outfit_hours: Num
    median_to_first_outfit_hours: Num
    users_reached_first_outfit: Num
    first_outfit_activation_rate: Num
    first_outfit_activation_basis: string
    first_outfit_activation_denominator: Num
  }
}

interface PayingUser {
  profile_id: number
  user_id: string
  email: string
  full_name: string
  telegram_username: string
  telegram_id: string
  registered_at: string
  subscription_type: string | null
  sub_status: string | null
  /** Computed in SQL by /admin/paying-users, on the same definition of "active"
   *  that monetization.premium_users uses (status='active' AND not expired).
   *  'never' is a credits-only buyer with no user_subscriptions row at all —
   *  distinct from 'expired', which the old two-branch ternary conflated. */
  sub_state: "active" | "expired" | "never" | null
  sub_expires: string
  payments: Array<{ amount: number; action: string; type: string; date: string }>
}

const COLORS = {
  primary: "#EC9DE2",
  success: "#89AEFF",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#B97DC6",
}

const EM_DASH = "—"

/**
 * null renders as an em-dash, never as 0.
 * A 0 on this page must mean "we counted zero", not "we could not count".
 */
const n = (v: Num, suffix = ""): string =>
  v === null || v === undefined ? EM_DASH : `${v.toLocaleString("ru")}${suffix}`

const pct = (v: Num): string => (v === null || v === undefined ? EM_DASH : `${v}%`)

/** Excel cells follow the same rule — the export must not invent a 0 either. */
const xl = (v: Num | string): number | string => (v === null || v === undefined ? EM_DASH : v)

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [payingUsers, setPayingUsers] = useState<PayingUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
    fetchPayingUsers()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const result = await api.get("/api/admin/analytics")
      setData(result)
    } catch (error) {
      console.error("Failed to load analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPayingUsers = async () => {
    try {
      const result = await api.get("/api/admin/paying-users")
      setPayingUsers(result.paying_users || [])
    } catch (error) {
      console.error("Failed to load paying users:", error)
    }
  }

  const exportToExcel = () => {
    if (!data) return

    const wb = XLSX.utils.book_new()

    // The export reads the SAME payload the dashboard renders, so the test-account
    // exclusion, the revenue gate and the CTR suppression apply here by
    // construction. Nothing is recomputed client-side — that is how an export
    // drifts away from the screen it claims to mirror.
    const summaryData: Array<Array<string | number>> = [
      ["Метрика", "Значение"],
      ["", ""],
      ["Тестовые аккаунты исключены", xl(data.meta.test_accounts_excluded)],
      // Both populations, because every rate in this workbook divides by the
      // second one. A single row called «Пользователей» let the reader assume
      // it was the account count; it never was.
      ["Аккаунтов создано (авторизовались)", xl(data.meta.accounts)],
      ["Из них заполнили профиль", xl(data.meta.profiles_with_data)],
      ["Аккаунтов без профиля", xl(data.meta.accounts_without_profile)],
      ["Знаменатель всех долей ниже", xl(data.meta.profiles_with_data)],
      ["Оговорка по популяции", data.meta.population_note],
      ["", ""],
      ["=== ОНБОРДИНГ ===", ""],
      ["Пользователей с первой вещью", xl(data.onboarding.users_with_first_item)],
      ["15+ вещей в гардеробе", xl(data.onboarding.users_wardrobe_15)],
      ["25+ вещей в гардеробе", xl(data.onboarding.users_wardrobe_25)],
      ["50+ вещей в гардеробе", xl(data.onboarding.users_wardrobe_50)],
      ["", ""],
      ["=== AHA-МОМЕНТ ===", ""],
      ["Первый образ", xl(data.ahaMoment.users_first_outfit)],
      ["Примерка (успешных списаний)", xl(data.ahaMoment.users_first_tryon)],
      ["Кликали по рекомендациям", xl(data.ahaMoment.users_clicked_recommendation)],
      ["", ""],
      ["=== РЕКОМЕНДАЦИИ ===", ""],
      ["Выдано сервером (served, НЕ показы)", xl(data.recommendations.served_rows)],
      ["Сессий выдачи", xl(data.recommendations.served_sessions)],
      ["Показы (карточка в зоне видимости)", xl(data.recommendations.impressions)],
      ["Пользователей с показами", xl(data.recommendations.impression_users)],
      ["Клики", xl(data.recommendations.clicks)],
      [
        "CTR (клики / показы)",
        data.recommendations.ctr === null
          ? `${EM_DASH} недостаточно данных (нужно ${data.recommendations.ctr_min_impressions} показов, есть ${xl(data.recommendations.ctr_basis.impressions)})`
          : `${data.recommendations.ctr}%`,
      ],
      [
        "Основание CTR",
        `${xl(data.recommendations.ctr_basis.clicks)} кликов / ${xl(data.recommendations.ctr_basis.impressions)} показов по ${xl(data.recommendations.ctr_basis.sessions)} сессиям — те же показы, что в строке выше, с ${data.recommendations.instrumentation_since}`,
      ],
      ["", ""],
      ["=== ДОСТАВКА ЦЕННОСТИ ===", ""],
      ["Всего образов сохранено", xl(data.value.total_outfits_saved)],
      ["Пользователей сохранявших образы", xl(data.value.users_saved_outfits)],
      ["Repeat Task Rate", pct(data.value.repeat_task_rate)],
      ["Образов на пользователя", xl(data.value.outfits_per_active_user)],
      ["", ""],
      ["=== AI-АССИСТЕНТ (не этап воронки) ===", ""],
      ["Использовали AI (успешных запросов)", xl(data.engagement.users_used_ai)],
      [
        `Доля от заполнивших профиль (${xl(data.engagement.ai_adoption_denominator)})`,
        pct(data.engagement.ai_adoption_pct),
      ],
      ["AI запросов выполнено", xl(data.engagement.total_ai_requests)],
      ["Из пользователей AI сохраняли образы", xl(data.engagement.ai_users_who_saved_look)],
      ["То же, %", pct(data.engagement.ai_users_who_saved_look_pct)],
      ["", ""],
      ["=== RETENTION (см. оговорку) ===", ""],
      [`До ${data.retention.measurement.cutoff} считались только платные действия`, ""],
      [
        "Покрытие инструментацией",
        `${xl(data.retention.measurement.instrumented_users)} из ${xl(data.retention.measurement.denominator)} заполнивших профиль (${pct(data.retention.measurement.coverage_pct)}); аккаунтов всего ${xl(data.retention.measurement.accounts)}`,
      ],
      ["D1 Retention", pct(data.retention.d1_retention)],
      ["D7 Retention", pct(data.retention.d7_retention)],
      ["D30 Retention", pct(data.retention.d30_retention)],
      ["D1 пользователей / из", `${xl(data.retention.d1_users)} / ${xl(data.retention.eligible_d1)}`],
      ["D7 пользователей / из", `${xl(data.retention.d7_users)} / ${xl(data.retention.eligible_d7)}`],
      ["D30 пользователей / из", `${xl(data.retention.d30_users)} / ${xl(data.retention.eligible_d30)}`],
      ["", ""],
      ["=== ВОРОНКА ПЛАТЕЖЕЙ ===", ""],
      // The caveat is exported ABOVE the numbers, in the same sheet. A row
      // labelled "Отвал" travels into decks without the dashboard around it.
      ["ВАЖНО", data.paymentFunnel.status_caveat.reason],
      ["Статусы в payments", data.paymentFunnel.status_caveat.statuses_observed.join(", ")],
      ["Счетов выставлено", xl(data.paymentFunnel.attempts)],
      ["Не подтверждено оплатой (pending)", xl(data.paymentFunnel.pending)],
      ["Оплата подтверждена", xl(data.paymentFunnel.paid)],
      ["Не подтверждено, % (pending / счета) — НЕ отвал", pct(data.paymentFunnel.unconfirmed_pct)],
      ["Пользователей выставляли счёт", xl(data.paymentFunnel.users_attempted)],
      ["Пользователей оплатило", xl(data.paymentFunnel.users_paid)],
      ["Выручка всего, ₽ (сумма фактических платежей)", xl(data.paymentFunnel.total_revenue)],
      ["", ""],
      ["=== МОНЕТИЗАЦИЯ ===", ""],
      ["Paywall показан", xl(data.monetization.paywall_shown)],
      ["Оплаченных подписок", xl(data.monetization.paid_subscriptions)],
      ["Активных подписок (всего)", xl(data.monetization.premium_users)],
      ["  — из них оплачено", xl(data.monetization.premium_paid)],
      ["  — из них выдано админом", xl(data.monetization.premium_granted)],
      [
        "Оговорка по подпискам",
        "«Выдано админом» — подписки из /grant-credits и /gift. У этих пользователей нет ни одного оплаченного платежа, поэтому в выручку они не входят.",
      ],
      [
        "Конверсия paywall -> оплата",
        `${EM_DASH} нет пересечения периодов (paywall ${data.monetization.paywall_window.join("..")}, оплаты ${data.monetization.paid_window.join("..")})`,
      ],
      ["", ""],
      ["=== ЮНИТ-ЭКОНОМИКА ===", ""],
      ...(data.revenue
        ? ([
            ["MRR", `${xl(data.revenue.mrr)} ₽`],
            ["Общая выручка", `${xl(data.revenue.total_revenue)} ₽`],
            ["ARPU", `${xl(data.revenue.arpu)} ₽`],
            ["ARPPU", `${xl(data.revenue.arppu)} ₽`],
            ["Платящих пользователей", xl(data.revenue.paying_users)],
          ] as Array<Array<string | number>>)
        : ([
            [
              "Не считаются",
              `${data.revenueGate.gated_metrics.join(", ").toUpperCase()} — платящих ${xl(data.revenueGate.payers)} из ${data.revenueGate.required}`,
            ],
            ["Почему", data.revenueGate.gated_reason],
            // The export says the same thing the card says. It must not imply
            // the workbook is revenue-free while the "Платежи" sheet carries
            // every monthly sum and the total.
            ["Выгружается несмотря на порог", data.revenueGate.shown_anyway_reason],
            ["Выручка всего, ₽", xl(data.paymentFunnel.total_revenue)],
            ["Удалены как невычислимые", data.revenueGate.removed_metrics.join(", ")],
          ] as Array<Array<string | number>>)),
      ["", ""],
      ["=== STICKINESS ===", ""],
      ["DAU (сегодня, неполный день)", xl(data.stickiness.dau)],
      ["MAU (30 дней)", xl(data.stickiness.mau)],
      // The two counts ship; the ratio is an em-dash whenever the backend
      // suppressed it, with the reason on the next row — so the workbook does
      // not print a stickiness number the screen refuses to print.
      ["DAU/MAU", pct(data.stickiness.ratio)],
      ...(data.stickiness.ratio === null
        ? [[
            "Почему DAU/MAU не посчитан",
            data.stickiness.ratio_suppressed_reason ??
              `ряд пересекает смену инструментации ${data.stickiness.cutoff}`,
          ]]
        : []),
      ["Ср. дней активности / 30 дней", xl(data.stickiness.avg_days_active)],
      ["", ""],
      ["=== TIME TO VALUE ===", ""],
      ["Среднее до первой вещи, ч", xl(data.timeToValue.avg_to_first_item_hours)],
      ["Медиана до первой вещи, ч", xl(data.timeToValue.median_to_first_item_hours)],
      ["Среднее до первого образа, ч", xl(data.timeToValue.avg_to_first_outfit_hours)],
      ["Медиана до первого образа, ч", xl(data.timeToValue.median_to_first_outfit_hours)],
      [
        `Активация (дошли до образа), от заполнивших профиль (${xl(data.timeToValue.first_outfit_activation_denominator)})`,
        pct(data.timeToValue.first_outfit_activation_rate),
      ],
      ["Дошли до первого образа", xl(data.timeToValue.users_reached_first_outfit)],
    ]

    if (data._errors?.length) {
      summaryData.push(["", ""], ["=== ОШИБКИ ЗАПРОСОВ ===", ""])
      data._errors.forEach((e) => summaryData.push([e.metric, e.error]))
    }

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Сводка")

    // Sheet: payment funnel by month
    const payData = [
      [data.paymentFunnel.status_caveat.reason],
      [],
      ["Месяц", "Счетов", "Не подтверждено", "Оплачено", "Пользователей", "Выручка ₽", "Оплата %", "Не подтверждено %"],
      ...data.paymentFunnel.by_month.map((m) => [
        m.month, m.attempts, m.pending, m.paid, m.users, m.revenue, xl(m.paid_pct), xl(m.unconfirmed_pct),
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payData), "Платежи")

    // Nested counts, with the off-path column, so the sheet cannot be read as
    // five independent populations the way the old flat [stage, users] list was.
    const funnelData: Array<Array<string | number>> = [
      ["Основа", data.funnelMeta.description],
      ["Исключено из воронки", `${data.funnelMeta.excluded_stages.join(", ")} — ${data.funnelMeta.excluded_reason}`],
      ["", ""],
      ["Этап", "Прошли шаг и все предыдущие", "От предыдущего %", "От аккаунта %", "Мимо воронки", "Всего сделали действие"],
      ...data.funnel.map((i) => [
        i.stage, xl(i.users), xl(i.conv_from_prev_pct), xl(i.conv_from_start_pct), xl(i.off_path), xl(i.total),
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(funnelData), "Воронка")

    const timelineData = [
      ["Дата", "Вещей добавлено", "Образов создано", "AI запросов", "Регистраций", "Активных пользователей"],
      ...data.timeline.map((i) => [
        i.date, i.items_added, i.outfits_created, i.ai_requests, i.registrations, i.active_users,
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(timelineData), "Динамика")

    if (data.cohortRetention?.length) {
      // The retained COUNT is suppressed together with the percentage, server
      // side. This sheet used to print `2026-06-22 | 2 | — | 1` — the dash said
      // "we are not showing you a rate from a two-person cohort" while the
      // next cell shipped its numerator, and the cohort size is right there.
      const cohortData = [
        [
          "Неделя", "Когорта", "W1 %", "W1", "W2 %", "W2", "W3 %", "W3", "W4 %", "W4",
        ],
        [
          `Когорты меньше ${data.cohortMinSize} человек: скрыты и доля, и число вернувшихся — иначе доля восстанавливается делением`,
          "", "", "", "", "", "", "", "", "",
        ],
        ...data.cohortRetention.map((c) => [
          c.week, c.cohort_size,
          xl(c.week_1_pct), xl(c.week_1), xl(c.week_2_pct), xl(c.week_2),
          xl(c.week_3_pct), xl(c.week_3), xl(c.week_4_pct), xl(c.week_4),
        ]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cohortData), "Когорты")
    }

    if (data.activation?.length) {
      const activationData = [
        ["Действие", "Сделали", "D7 retention %", "Не сделали", "D7 retention %", "Разница pp"],
        ...data.activation.map((a) => [
          a.action, xl(a.did_total), xl(a.did_retention_pct),
          xl(a.didnt_total), xl(a.didnt_retention_pct),
          a.did_retention_pct !== null && a.didnt_retention_pct !== null
            ? +(a.did_retention_pct - a.didnt_retention_pct).toFixed(1)
            : EM_DASH,
        ]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(activationData), "Activation")
    }

    XLSX.writeFile(wb, `analytics_${new Date().toISOString().split("T")[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-gray-500">Не удалось загрузить аналитику</div>
      </div>
    )
  }

  const cohortCells = (c: AnalyticsData["cohortRetention"][number]) => [
    { pct: c.week_1_pct, users: c.week_1, elapsed: c.week_1_elapsed },
    { pct: c.week_2_pct, users: c.week_2, elapsed: c.week_2_elapsed },
    { pct: c.week_3_pct, users: c.week_3, elapsed: c.week_3_elapsed },
    { pct: c.week_4_pct, users: c.week_4, elapsed: c.week_4_elapsed },
  ]

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Аналитика продукта</h1>
          <p className="text-muted-foreground mt-2">
            Ключевые метрики и поведение пользователей
            {data.meta.excludes_test_accounts && (
              <> · тестовые аккаунты исключены ({n(data.meta.test_accounts_excluded)})</>
            )}
            {" · "}
            {n(data.meta.accounts)} аккаунтов, из них {n(data.meta.profiles_with_data)} заполнили профиль
          </p>
          {/* The gap is not a footnote. 160 of 455 accounts on prod authenticated
              and never submitted the profile form; every rate on this page has
              the smaller number as its denominator, so the reader has to know
              the two are different before reading any of them. */}
          {(data.meta.accounts_without_profile ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
              {n(data.meta.accounts_without_profile)} аккаунтов авторизовались, но не заполнили
              профиль. {data.meta.population_note}
            </p>
          )}
        </div>
        <Button onClick={exportToExcel} className="gap-2">
          <Download className="h-4 w-4" />
          Экспорт в Excel
        </Button>
      </div>

      {/* Query failures — a metric that errored shows "—", and this says why. */}
      {(data._errors?.length ?? 0) > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-4 w-4" />
              {data._errors.length} запрос(ов) не выполнились — соответствующие метрики показаны как {EM_DASH}, а не как 0
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-48 overflow-auto">
              {data._errors.map((e, i) => (
                <div key={i} className="text-xs font-mono text-red-900">
                  <span className="font-bold">{e.metric}</span>: {e.error}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Payment funnel — replaces the revenue block ────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-amber-500" />
          Воронка платежей
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Счёт выставлен {EM_DASH}&gt; оплата подтверждена вебхуком. Тестовые аккаунты исключены.
        </p>

        {/* The caveat sits ABOVE the number it qualifies, not in a footnote
            below the fold. `pending` is the residual bucket — it is the one
            number in this block big enough to be pasted into a deck, and
            «88.9% отвал» is a claim the schema cannot support. */}
        {!data.paymentFunnel.status_caveat.has_failure_status && (
          <Card className="border-dashed border-amber-300 bg-amber-50 mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Это не отвал: у платежей нет статуса неудачи
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-amber-900 space-y-2">
              <p>{data.paymentFunnel.status_caveat.reason}</p>
              <p>
                Статусы в таблице payments:{" "}
                <span className="font-mono">
                  {data.paymentFunnel.status_caveat.statuses_observed.join(", ") || EM_DASH}
                </span>
                .
              </p>
              <p>{data.paymentFunnel.status_caveat.unblocks_when}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Счетов выставлено</CardTitle>
              <CardDescription className="text-xs">строк в payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.paymentFunnel.attempts)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                от {n(data.paymentFunnel.users_attempted)} пользователей
              </p>
            </CardContent>
          </Card>

          {/* Neutral, not red. Red asserts that the gap is bad user behaviour;
              what is actually known is that no webhook confirmed these
              invoices. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {data.paymentFunnel.status_caveat.unconfirmed_label}
              </CardTitle>
              <CardDescription className="text-xs">
                счёт создан, оплата не подтверждена
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.paymentFunnel.pending)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {pct(data.paymentFunnel.unconfirmed_pct)} всех счетов
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Оплата подтверждена</CardTitle>
              <CardDescription className="text-xs">вебхук провайдера дошёл</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.paymentFunnel.paid)}</div>
              <p className="text-xs text-muted-foreground mt-1">{pct(data.paymentFunnel.paid_pct)} счетов</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Дошли до оплаты</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.paymentFunnel.users_paid)}</div>
              <p className="text-xs text-muted-foreground mt-1">уникальных пользователей</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">По месяцам</CardTitle>
            <CardDescription>
              Серая доля — счета без подтверждённой оплаты. Среди них неразличимы отказ карты,
              брошенная форма, платёж в процессе и не дошедший вебхук.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.paymentFunnel.by_month}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="pending" name="Не подтверждено" stackId="a" fill="#cbd5e1" />
                <Bar dataKey="paid" name="Оплачено" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Месяц</TableHead>
                  <TableHead className="text-center">Счетов</TableHead>
                  <TableHead className="text-center">Не подтверждено</TableHead>
                  <TableHead className="text-center">Оплачено</TableHead>
                  {/* Was «Отвал» with a destructive badge above 80%. Both
                      attributed the gap to the user; the column measures the
                      absence of a confirmation, not a decision. */}
                  <TableHead className="text-center">Не подтверждено, %</TableHead>
                  <TableHead className="text-right">Выручка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.paymentFunnel.by_month.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{m.month}</TableCell>
                    <TableCell className="text-center">{m.attempts}</TableCell>
                    <TableCell className="text-center">{m.pending}</TableCell>
                    <TableCell className="text-center">{m.paid}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{pct(m.unconfirmed_pct)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.revenue.toLocaleString("ru")} &#8381;</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue: gated ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          Юнит-экономика
        </h2>
        {data.revenue ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              ["MRR", `${n(data.revenue.mrr)} ₽`, "Monthly Recurring Revenue"],
              ["Общая выручка", `${n(data.revenue.total_revenue)} ₽`, "Все оплаченные платежи"],
              ["ARPU", `${n(data.revenue.arpu)} ₽`, "Выручка / заполнившие профиль"],
              ["ARPPU", `${n(data.revenue.arppu)} ₽`, "Выручка / платящие"],
              ["Платящих", n(data.revenue.paying_users), "Уникальных"],
            ].map(([title, value, hint]) => (
              <Card key={title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Не считаем на {n(data.revenueGate.payers)} платящих (порог {data.revenueGate.required}):{" "}
                {data.revenueGate.gated_metrics.map((m) => m.toUpperCase()).join(" / ")}
              </CardTitle>
              <CardDescription>{data.revenueGate.gated_reason}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              {/* What IS shown, said out loud. The previous copy claimed the API
                  carried no revenue numbers at all while the table above this
                  card printed выручку по месяцам and /paying-users printed every
                  amount. A caveat that describes a different system than the one
                  shipping is the same defect as a fake metric. */}
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Что при этом показано и выгружается:</p>
                <p className="mt-1">
                  Выручка по месяцам в таблице «Воронка платежей» (всего{" "}
                  {n(data.paymentFunnel.total_revenue)} ₽), суммы платежей в таблице «Оплатившие
                  пользователи» и число платящих ({n(data.revenueGate.payers)}).{" "}
                  {data.revenueGate.shown_anyway_reason}
                </p>
              </div>
              <p className="font-medium text-foreground">Удалены как невычислимые, а не просто шумные:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <span className="font-mono text-xs">LTV</span> = ARPPU x срок жизни, но ARPPU
                  считается от выручки за весь срок жизни — множитель применялся к числу,
                  которое его уже содержит.
                </li>
                <li>
                  <span className="font-mono text-xs">Churn</span> искал подписки со
                  статусом <span className="font-mono text-xs">!= &apos;active&apos;</span>; другого
                  статуса в таблице не бывает, поэтому условие не может совпасть никогда.
                </li>
                <li>
                  <span className="font-mono text-xs">Конверсия paywall</span> делила оплаты
                  ({data.monetization.paid_window.join(" .. ")}) на показы paywall
                  ({data.monetization.paywall_window.join(" .. ")}) — периоды не пересекаются
                  ни на один день ({n(data.monetization.conversion_overlap_days)} дней пересечения).
                </li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Monetization (what is real) ────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#B97DC6]" />
          Монетизация
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Paywall показан</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.monetization.paywall_shown)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                с {data.monetization.paywall_window[0] || EM_DASH}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Оплаченных подписок</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.monetization.paid_subscriptions)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.monetization.paid_window[0] || EM_DASH} .. {data.monetization.paid_window[1] || EM_DASH}
              </p>
            </CardContent>
          </Card>
          {/* An active subscription row has two possible authors: the payment
              webhook, and the admin buttons /grant-credits and /gift. Under a
              «Монетизация» heading, one tile away from «Оплаченных подписок»,
              the undifferentiated total reads as "N people are on paid plans" —
              on prod that is 7, of which only 3 belong to anyone who ever paid.
              The catalog's brand column in this same response carries three
              levels of provenance; the money number gets it too. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Активных подписок</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.monetization.premium_users)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                оплачено {n(data.monetization.premium_paid)} · выдано админом{" "}
                {n(data.monetization.premium_granted)}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Выданные админом подписки — не выручка: у этих пользователей нет ни одного
                оплаченного платежа.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Onboarding ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-[#B97DC6]" />
          Онбординг
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Первая вещь</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.onboarding.users_with_first_item)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {pct(
                  data.onboarding.users_with_first_item !== null && data.meta.profiles_with_data
                    ? +((data.onboarding.users_with_first_item / data.meta.profiles_with_data) * 100).toFixed(1)
                    : null,
                )}{" "}
                от заполнивших профиль ({n(data.meta.profiles_with_data)})
              </p>
            </CardContent>
          </Card>
          {/* Labels are item counts. They used to read "30% / 50% / 100% гардероба"
              while thresholding at 15/25/50 items — a percentage of a wardrobe
              size nobody ever declared. */}
          {[
            ["15+ вещей", data.onboarding.users_wardrobe_15],
            ["25+ вещей", data.onboarding.users_wardrobe_25],
            ["50+ вещей", data.onboarding.users_wardrobe_50],
          ].map(([label, value]) => (
            <Card key={label as string}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{label as string}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{n(value as Num)}</div>
                <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Aha-moment ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Aha-момент
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Первый образ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.ahaMoment.users_first_outfit)}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей сохранили образ</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Примерка</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.ahaMoment.users_first_tryon)}</div>
              {/* Only consume_success. Открытая шторка и упёршийся в paywall
                  клик больше не считаются примеркой. */}
              <p className="text-xs text-muted-foreground mt-1">Успешно списано (не клики)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Кликали рекомендации</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.ahaMoment.users_clicked_recommendation)}</div>
              <p className="text-xs text-muted-foreground mt-1">Пользователей</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recommendations: served vs impressions ─────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <Target className="h-5 w-5 text-[#89AEFF]" />
          Рекомендации
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          «Выдано» — сколько карточек вернул ранжировщик. «Показы» — сколько попало в зону
          видимости и отправило событие. Это разные величины, и CTR никогда не считается от «выдано».
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Выдано сервером</CardTitle>
              <CardDescription className="text-xs">CLIP-выдача, не показы</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.recommendations.served_rows)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {n(data.recommendations.served_sessions)} сессий · {n(data.recommendations.served_users)} польз.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Показы</CardTitle>
              <CardDescription className="text-xs">
                с {data.recommendations.instrumentation_since}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.recommendations.impressions)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {n(data.recommendations.impression_sessions)} сессий · {n(data.recommendations.impression_users)} польз.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Клики</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.recommendations.clicks)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {n(data.recommendations.click_users)} уникальных пользователей
              </p>
            </CardContent>
          </Card>
          <Card className={data.recommendations.ctr === null ? "border-dashed" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">CTR</CardTitle>
              {/* Denominator = the «Показы» tile to the left, exactly. It used
                  to be a paired subsample (152 of 414 on prod), so two tiles
                  side by side printed different numbers under the same word. */}
              <CardDescription className="text-xs">клики / показы слева</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recommendations.ctr === null ? (
                <>
                  <div className="text-2xl font-bold text-muted-foreground">{EM_DASH}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Недостаточно данных: {n(data.recommendations.ctr_basis.impressions)} показов
                    из {data.recommendations.ctr_min_impressions} нужных
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">{pct(data.recommendations.ctr)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {n(data.recommendations.ctr_basis.clicks)} / {n(data.recommendations.ctr_basis.impressions)}
                    {" "}по {n(data.recommendations.ctr_basis.sessions)} сессиям
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Value + engagement ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Доставка ценности
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Образов сохранено", n(data.value.total_outfits_saved), "Всего"],
            ["Сохраняли образы", n(data.value.users_saved_outfits), "Пользователей"],
            ["Repeat Task Rate", pct(data.value.repeat_task_rate), "2+ образов"],
            ["Образов на польз.", n(data.value.outfits_per_active_user), "В среднем"],
          ].map(([title, value, hint]) => (
            <Card key={title as string}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{title as string}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value as string}</div>
                <p className="text-xs text-muted-foreground mt-1">{hint as string}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── AI adoption: its own denominator, NOT a funnel stage ────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#B97DC6]" />
          AI-ассистент
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{data.funnelMeta.excluded_reason}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Использовали AI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.engagement.users_used_ai)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {pct(data.engagement.ai_adoption_pct)} от заполнивших профиль (
                {n(data.engagement.ai_adoption_denominator)}), не от всех{" "}
                {n(data.meta.accounts)} аккаунтов
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">AI запросов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.engagement.total_ai_requests)}</div>
              <p className="text-xs text-muted-foreground mt-1">Только выполненные (consume_success)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Из них сохраняли образы</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.engagement.ai_users_who_saved_look)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {pct(data.engagement.ai_users_who_saved_look_pct)} пользователей AI — пересечение, а не этап воронки
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Retention + stickiness, with the discontinuity spelled out ─── */}
      <div>
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#89AEFF]" />
          Retention и DAU/MAU
        </h2>
        <Card className="border-amber-300 bg-amber-50 mb-4">
          <CardContent className="pt-4 text-sm text-amber-900 space-y-1">
            <p className="font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Разрыв в измерении: {data.meta.activity_cutoff}
            </p>
            <p>
              До этой даты активность записывалась только при списании платного действия,
              поэтому вся история ниже измеряет <strong>платные действия</strong>, а не возвраты:
              строка появлялась у {n(data.retention.measurement.instrumented_users)} из{" "}
              {n(data.retention.measurement.denominator)} заполнивших профиль (
              {pct(data.retention.measurement.coverage_pct)}). Аккаунты без профиля (
              {n(data.meta.accounts_without_profile)}) в этот знаменатель не входят вообще:
              daily_user_activity привязана к профилю, поэтому строки у них быть не может.
              С {data.meta.activity_cutoff} активность пишется на любой авторизованный запрос,
              и ряды по обе стороны от этой даты несравнимы.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">D1 / D7 / D30</CardTitle>
              <CardDescription className="text-xs">Нижняя граница: только платные действия до {data.meta.activity_cutoff}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6">
                {[
                  ["D1", data.retention.d1_retention, data.retention.d1_users, data.retention.eligible_d1],
                  ["D7", data.retention.d7_retention, data.retention.d7_users, data.retention.eligible_d7],
                  ["D30", data.retention.d30_retention, data.retention.d30_users, data.retention.eligible_d30],
                ].map(([label, p, users, eligible]) => (
                  <div key={label as string}>
                    <div className="text-2xl font-bold">{pct(p as Num)}</div>
                    <p className="text-xs text-muted-foreground">
                      {label as string} · {n(users as Num)}/{n(eligible as Num)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* DAU and MAU are two counts, and until the whole MAU window sits
              after the cutoff they are counts made by two different
              instruments. The ratio was the largest element on this card while
              its numerator came from the new activity ping and its denominator
              from 29 days of the old paid-actions-only path. The counts still
              ship — they are countable facts — the quotient does not. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">DAU / MAU</CardTitle>
              <CardDescription className="text-xs">
                DAU за сегодня — неполный день
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.stickiness.ratio === null ? (
                <>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <div className="text-3xl font-bold">{n(data.stickiness.dau)}</div>
                      <p className="text-xs text-muted-foreground">DAU</p>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{n(data.stickiness.mau)}</div>
                      <p className="text-xs text-muted-foreground">MAU</p>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-muted-foreground">{EM_DASH}</div>
                      <p className="text-xs text-muted-foreground">DAU/MAU</p>
                    </div>
                  </div>
                  <p className="text-xs text-amber-800 mt-2">
                    {data.stickiness.ratio_suppressed_reason ??
                      `недостаточно однородных данных: ряд пересекает смену инструментации ${data.stickiness.cutoff}`}
                  </p>
                  {data.stickiness.mau_window_start && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Окно MAU: с {data.stickiness.mau_window_start} · ср.{" "}
                      {n(data.stickiness.avg_days_active)} дн. активности за 30 дней
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="text-4xl font-bold">{pct(data.stickiness.ratio)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {n(data.stickiness.dau)} DAU / {n(data.stickiness.mau)} MAU ·
                    ср. {n(data.stickiness.avg_days_active)} дн. активности за 30 дней
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Cohorts ────────────────────────────────────────────────────── */}
      {data.cohortRetention?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Когортный Retention</CardTitle>
            <CardDescription>
              По неделе регистрации. Ячейка показывает {EM_DASH}, если когорта меньше{" "}
              {data.cohortMinSize} человек или неделя ещё не закончилась — 100% от одного
              пользователя не является фактом о продукте. Скрывается и доля, и число
              вернувшихся: из «1 из 2» доля восстанавливается делением, поэтому выгрузка
              не содержит ни того, ни другого.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Неделя</TableHead>
                  <TableHead className="text-center">Когорта</TableHead>
                  <TableHead className="text-center">W1</TableHead>
                  <TableHead className="text-center">W2</TableHead>
                  <TableHead className="text-center">W3</TableHead>
                  <TableHead className="text-center">W4</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cohortRetention.map((c) => (
                  <TableRow key={c.week}>
                    <TableCell className="font-medium text-sm">
                      {new Date(c.week).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      {c.cohort_size}
                      {c.low_sample && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          &lt;{data.cohortMinSize}
                        </span>
                      )}
                    </TableCell>
                    {cohortCells(c).map((cell, i) => (
                      <TableCell key={i} className="text-center">
                        {cell.pct === null ? (
                          <span
                            className="inline-block px-2 py-0.5 text-xs text-muted-foreground"
                            title={
                              !cell.elapsed
                                ? "Период ещё не завершился"
                                : c.suppressed_reason ?? `Когорта меньше ${data.cohortMinSize}`
                            }
                          >
                            {EM_DASH}
                          </span>
                        ) : (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor:
                                cell.pct === 0 ? "#f3f4f6" : `rgba(16, 185, 129, ${Math.min(cell.pct / 100, 0.8) + 0.1})`,
                              color: cell.pct >= 30 ? "white" : cell.pct > 0 ? "#065f46" : "#9ca3af",
                            }}
                          >
                            {cell.pct}%
                          </span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Activation ─────────────────────────────────────────────────── */}
      {data.activation?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activation: что предсказывает retention?</CardTitle>
            <CardDescription>
              D7 retention для пользователей, которые сделали / не сделали действие. Наследует
              оговорку об измерении активности выше.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Действие</TableHead>
                  <TableHead className="text-center">Сделали</TableHead>
                  <TableHead className="text-center">D7 retention</TableHead>
                  <TableHead className="text-center">Не сделали</TableHead>
                  <TableHead className="text-center">D7 retention</TableHead>
                  <TableHead className="text-center">Разница</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activation.map((a) => {
                  const diff =
                    a.did_retention_pct !== null && a.didnt_retention_pct !== null
                      ? a.did_retention_pct - a.didnt_retention_pct
                      : null
                  const actionLabels: Record<string, string> = {
                    first_item: "Добавили вещь",
                    first_outfit: "Создали образ",
                  }
                  return (
                    <TableRow key={a.action}>
                      <TableCell className="font-medium">{actionLabels[a.action] || a.action}</TableCell>
                      <TableCell className="text-center">{n(a.did_total)}</TableCell>
                      <TableCell className="text-center font-bold">{pct(a.did_retention_pct)}</TableCell>
                      <TableCell className="text-center">{n(a.didnt_total)}</TableCell>
                      <TableCell className="text-center font-bold">{pct(a.didnt_retention_pct)}</TableCell>
                      <TableCell className="text-center">
                        {diff === null ? (
                          EM_DASH
                        ) : (
                          <Badge variant={diff > 10 ? "default" : "secondary"} className={diff > 10 ? "bg-green-600" : ""}>
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(1)}pp
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Time to value ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-orange-500" />
          Time to Value
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">До первой вещи</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.timeToValue.median_to_first_item_hours, " ч")}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Медиана · среднее {n(data.timeToValue.avg_to_first_item_hours, " ч")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">До первого образа</CardTitle>
              <CardDescription className="text-xs">Главный рычаг активации</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{n(data.timeToValue.median_to_first_outfit_hours, " ч")}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Медиана · среднее {n(data.timeToValue.avg_to_first_outfit_hours, " ч")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Активация: {pct(data.timeToValue.first_outfit_activation_rate)} дошли до образа (
                {n(data.timeToValue.users_reached_first_outfit)} из{" "}
                {n(data.timeToValue.first_outfit_activation_denominator)} заполнивших профиль)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Product funnel — a NESTED population, verified monotonic ────── */}
      <Card>
        <CardHeader>
          <CardTitle>Воронка продукта</CardTitle>
          <CardDescription>{data.funnelMeta.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 6 stages now that «Аккаунт создан» leads — the fixed 260px left
              the bars overlapping their own labels. */}
          <ResponsiveContainer width="100%" height={Math.max(260, data.funnel.length * 52)}>
            <BarChart data={data.funnel} layout="vertical">
              <XAxis type="number" />
              <YAxis dataKey="stage" type="category" width={150} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const f = payload[0].payload as AnalyticsData["funnel"][number]
                  return (
                    <div className="rounded-lg border bg-white/95 p-3 text-xs shadow-sm">
                      <div className="font-medium mb-1">{f.stage}</div>
                      <div>
                        {n(f.users)} прошли этот шаг <span className="text-muted-foreground">и все предыдущие</span>
                      </div>
                      {f.conv_from_prev_pct !== null && (
                        <div className="text-muted-foreground">{pct(f.conv_from_prev_pct)} от предыдущего шага</div>
                      )}
                      {(f.off_path ?? 0) > 0 && (
                        <div className="text-amber-700 mt-1">
                          + {n(f.off_path)} сделали это действие, минуя предыдущие шаги ({n(f.total)} всего)
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="users" fill={COLORS.primary} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Этап</TableHead>
                <TableHead className="text-center">Прошли шаг и все предыдущие</TableHead>
                <TableHead className="text-center">От предыдущего</TableHead>
                <TableHead className="text-center">От аккаунта</TableHead>
                <TableHead className="text-right">Мимо воронки</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.funnel.map((f) => (
                <TableRow key={f.stage}>
                  <TableCell className="font-medium">{f.stage}</TableCell>
                  <TableCell className="text-center">{n(f.users)}</TableCell>
                  <TableCell className="text-center">{pct(f.conv_from_prev_pct)}</TableCell>
                  <TableCell className="text-center">{pct(f.conv_from_start_pct)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {(f.off_path ?? 0) > 0 ? `${n(f.off_path)} (всего ${n(f.total)})` : EM_DASH}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground mt-3">
            «Мимо воронки» — пользователи, сделавшие действие, но не выполнившие один из шагов выше.
            Они не добавляются в столбик, иначе этап оказался бы больше своего надмножества.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Этап «{data.funnelMeta.excluded_stages.join(", ")}» убран из воронки: {data.funnelMeta.excluded_reason}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Этап «Онбординг завершён» удалён: он читал колонку с DEFAULT true, где 296 из 297
            значений — умолчание, а не действие пользователя.
          </p>
        </CardContent>
      </Card>

      {/* ── Timeline: three distinct series, no duplicates ─────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Динамика за 30 дней</CardTitle>
          <CardDescription>
            Три разных ряда. Раньше «первые образы» и «сохранённые образы» рисовались из
            одного и того же значения — один ряд на графике выглядел как два.
            {data.timelineMeta.zero_filled && (
              <>
                {" "}Все {data.timelineMeta.days} дней ({data.timelineMeta.from} .. {data.timelineMeta.to})
                присутствуют явно: день без событий — это ноль, а не разрыв, через который
                график проводил прямую.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.timeline}>
              <defs>
                <linearGradient id="colorItems" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOutfits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(v) => new Date(v).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip
                labelFormatter={(v) => new Date(v).toLocaleDateString("ru")}
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              {/* NO measurement-break marker here, deliberately.
                  meta.activity_cutoff is the day daily_user_activity started
                  being written on every authorised request. The three series
                  below come from wardrobe_user_items, user_looks and
                  usage_events — none of them read daily_user_activity, none of
                  them change meaning on that date. The dashed line used to be
                  drawn here with the caption "ряды слева и справа от неё
                  измерены по-разному", which was false for all three.
                  The break belongs to `active_users`, and the marker now lives
                  on the chart that plots it: /admin/users → «Активность».
                  See timelineMeta.cutoff_applies_to in the payload. */}
              <Area
                type="monotone"
                dataKey="items_added"
                name="Вещей добавлено"
                stroke={COLORS.primary}
                strokeWidth={2}
                fill="url(#colorItems)"
              />
              <Area
                type="monotone"
                dataKey="outfits_created"
                name="Образов создано"
                stroke={COLORS.success}
                strokeWidth={2}
                fill="url(#colorOutfits)"
              />
              <Area
                type="monotone"
                dataKey="ai_requests"
                name="AI запросов"
                stroke={COLORS.purple}
                strokeWidth={2}
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Смена инструментации {data.meta.activity_cutoff} на эти ряды не влияет: они считаются
            по wardrobe_user_items, user_looks и usage_events, а не по daily_user_activity.
            Разрыв касается только ряда «активные пользователи» — он нарисован на графике
            «Активность» в разделе «Пользователи».
          </p>
        </CardContent>
      </Card>

      {/* ── Paying users ───────────────────────────────────────────────── */}
      {payingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Оплатившие пользователи ({payingUsers.length})
            </CardTitle>
            <CardDescription>Оплаченные транзакции, без тестовых аккаунтов</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Email / Telegram</TableHead>
                  <TableHead>Подписка</TableHead>
                  <TableHead>Платежи</TableHead>
                  <TableHead>Дата регистрации</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payingUsers.map((pu) => (
                  <TableRow key={pu.user_id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{pu.full_name || "Пользователь"}</span>
                        <span className="text-xs text-muted-foreground">{pu.user_id.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {pu.email && <span className="text-sm">{pu.email}</span>}
                        {pu.telegram_username && <span className="text-xs text-blue-600">@{pu.telegram_username}</span>}
                        {pu.telegram_id && <span className="text-xs text-muted-foreground">TG ID: {pu.telegram_id}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Three states, three badges. The old code branched on
                          `sub_status === "active"` alone, which (a) painted a
                          green «Pro» on a subscription that lapsed five months
                          ago, because the server's LEFT JOIN filtered on status
                          without checking expires_at, and (b) printed «Истекла»
                          for credits-only buyers who never had a subscription at
                          all. sub_state now comes from SQL. */}
                      {pu.sub_state === "active" ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="default" className="bg-green-600 w-fit">
                            {pu.subscription_type === "yearly" ? "Pro (год)" : "Pro (мес)"}
                          </Badge>
                          {pu.sub_expires && (
                            <span className="text-xs text-muted-foreground">
                              до {new Date(pu.sub_expires).toLocaleDateString("ru")}
                            </span>
                          )}
                        </div>
                      ) : pu.sub_state === "expired" ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="secondary" className="w-fit">Истекла</Badge>
                          {pu.sub_expires && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(pu.sub_expires).toLocaleDateString("ru")}
                            </span>
                          )}
                        </div>
                      ) : pu.sub_state === "never" ? (
                        <Badge variant="outline" className="w-fit text-muted-foreground">
                          Только кредиты, подписки не было
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{EM_DASH}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {pu.payments.map((p, i) => (
                          <span key={i} className="text-xs">
                            {p.amount} RUB — {p.action === "subscribe" ? `подписка ${p.type}` : "кредиты"}
                            <span className="text-muted-foreground ml-1">
                              ({new Date(p.date).toLocaleDateString("ru")})
                            </span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {pu.registered_at ? new Date(pu.registered_at).toLocaleDateString("ru") : EM_DASH}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
