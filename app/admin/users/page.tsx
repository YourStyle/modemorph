"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { api } from "@/lib/api-client"
// ReferenceLine: this page owns the `active_users` series, so it owns the
// measurement break at meta.activity_cutoff. The marker used to be drawn on the
// analytics «Динамика за 30 дней» chart, which plots items / outfits / AI —
// three series the activity ping never touched.
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { Users, TrendingUp, Calendar, CreditCard, Loader2, Download, RotateCcw } from "lucide-react"
import * as XLSX from "xlsx"

interface User {
  id: number
  user_id: string
  full_name: string
  is_admin: boolean
  /** Flagged by migration 029. The analytics page excludes these rows from every
   *  metric; this table keeps them (an admin still has to find them) and badges
   *  them, so the two pages do not disagree silently about who counts. */
  is_test?: boolean | null
  created_at: string
  updated_at: string
  email: string | null
  user_subscriptions: Array<{
    subscription_type: string
    status: string
    start_date: string
    end_date: string
    credits_included: number
  }>
  user_credits: Array<{
    credits_balance: number
    updated_at: string
  }>
  /**
   * REMAINING BALANCE, not usage. backend/app/api/limits.py `_use_feature()`
   * decrements these columns (`SET "<feature>" = "<feature>" - :cnt`), so a
   * heavy user reads LOW here, not high. Never label these «AI запросов» or
   * «Вещей в гардеробе» — use the `*_count` / `*_used` fields below for that.
   */
  limits: Array<{
    wardrobe_items_anlyzed: number
    ai_requests: number
    ideas_viewed: number
    outfits_saved: number
    vton_used: number
  }>
  /** Actual counts from /api/admin/users — rows in wardrobe_user_items and
   *  usage_events(action='consume_success'). Absent on an older API build. */
  wardrobe_items_count?: number | null
  ai_requests_used?: number | null
  photos_analyzed?: number | null
}

const EM_DASH = "—"

/** null renders as an em-dash, never as 0 — a 0 here must mean "counted zero". */
const n = (v: number | null | undefined): string =>
  v === null || v === undefined ? EM_DASH : v.toLocaleString("ru")

/**
 * Same contract as n(), for spreadsheet cells: a present value stays a real
 * number so Excel can sort and sum it, and only a missing one becomes text.
 * n() would write "1 234" — a string that silently breaks both.
 */
const xl = (v: number | null | undefined): number | string =>
  v === null || v === undefined ? EM_DASH : v

/**
 * The four tiles and two charts on this page, read off /api/admin/analytics.
 *
 * GET /api/admin/metrics is DELETED. It was a second implementation of these
 * exact numbers and it disagreed with the analytics dashboard on prod:
 * 297 users / 9 subscriptions / 11 MAU here versus 295 / 7 / 10 one nav item
 * away. It never applied the is_test exclusion, its MAU window was
 * `>= CURRENT_DATE - 30` (31 days), and its `safe_scalar(..., default=0)`
 * turned a failed query into a confident 0. Both numbers now come from the one
 * place that computes them.
 */
interface Metrics {
  /**
   * `accounts` is everyone who ever authenticated (`users`); `profiles` is
   * everyone who then submitted the profile form (`user_profiles`). This tile
   * printed `profiles` under the caption «Зарегистрированных аккаунтов» — on
   * prod, 295 under a label describing 455. They are two populations and both
   * are rendered, because the difference (160 people who opened the app and
   * bounced off the profile form) is the biggest drop in the funnel.
   */
  accounts: number | null
  profiles: number | null
  accountsWithoutProfile: number | null
  mau: number | null
  dau: number | null
  /** Total active subscriptions, and the provenance split behind it. A grant
   *  from /grant-credits or /gift writes the same status='active' row a paid
   *  webhook does, so the total alone overstates paid premium. */
  activeSubscriptions: number | null
  subscriptionsPaid: number | null
  subscriptionsGranted: number | null
  testAccountsExcluded: number | null
  activityCutoff: string
  dauIsPartial: boolean
  /** Server-built 30-day spine: days with no events are an explicit 0. */
  timeline: Array<{ date: string; registrations: number; active_users: number }>
  failedQueries: number
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  /** Profiles matching the current filter server-side. `users.length` is only
   *  what the LIMIT returned; the two are printed together, never conflated. */
  const [userTotal, setUserTotal] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [grantCredits, setGrantCredits] = useState("")
  const [grantSubscription, setGrantSubscription] = useState("")
  const [subscriptionDuration, setSubscriptionDuration] = useState("")

  // "🎁 Подарок" template state
  const [giftUser, setGiftUser] = useState<User | null>(null)
  const [giftCredits, setGiftCredits] = useState("50")
  const [giftDuration, setGiftDuration] = useState<"monthly" | "yearly" | "">("monthly")
  const [giftBotMessage, setGiftBotMessage] = useState(
    "✨ <b>Вам выдана подписка!</b>\n\nМы начислили <b>{credits}</b> кредитов и активировали подписку на <b>{duration_ru}</b>.\n\nЗаходите в приложение — все лимиты сняты."
  )
  const [giftSheetTitle, setGiftSheetTitle] = useState("Вам подарок ✨")
  const [giftSheetBody, setGiftSheetBody] = useState(
    "Мы подарили вам подписку и кредиты, чтобы вы могли попробовать всё без ограничений."
  )
  const [giftSheetBullets, setGiftSheetBullets] = useState(
    "Оцифровка гардероба по фото\nПодбор образов AI-стилистом\nВиртуальная примерка"
  )
  const [giftCtaText, setGiftCtaText] = useState("Круто, спасибо!")
  const [giftSending, setGiftSending] = useState(false)

  useEffect(() => {
    fetchUsers()
    fetchMetrics()
  }, [])

  const fetchUsers = async () => {
    try {
      const data = await api.get("/api/admin/users")
      setUsers(data.users)
      // The table used to title itself «Пользователи (200)» — the LIMIT, printed
      // as if it were the population, next to a tile saying 295. The server now
      // returns how many rows match, so the header can say "N of M" instead of
      // presenting a slice as the whole list.
      setUserTotal(typeof data.total === "number" ? data.total : null)
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить пользователей",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchMetrics = async () => {
    try {
      // Same endpoint the analytics dashboard renders, so the two pages cannot
      // disagree about how many users exist. This is a projection of that
      // payload, not a second calculation.
      const d = await api.get("/api/admin/analytics")
      setMetrics({
        accounts: d.meta?.accounts ?? null,
        profiles: d.meta?.profiles_with_data ?? null,
        accountsWithoutProfile: d.meta?.accounts_without_profile ?? null,
        mau: d.stickiness?.mau ?? null,
        dau: d.stickiness?.dau ?? null,
        activeSubscriptions: d.monetization?.premium_users ?? null,
        subscriptionsPaid: d.monetization?.premium_paid ?? null,
        subscriptionsGranted: d.monetization?.premium_granted ?? null,
        testAccountsExcluded: d.meta?.test_accounts_excluded ?? null,
        activityCutoff: d.meta?.activity_cutoff ?? "",
        dauIsPartial: d.stickiness?.dau_is_partial ?? false,
        timeline: d.timeline ?? [],
        failedQueries: d._errors?.length ?? 0,
      })
    } catch (error) {
      console.error("Failed to load metrics:", error)
    } finally {
      setMetricsLoading(false)
    }
  }

  const exportUsersToExcel = async () => {
    if (users.length === 0) return
    setExporting(true)

    // The workbook must not be a slice of the screen. The table renders at most
    // `limit` rows; the export re-fetches with a limit above the population so
    // the «Пользователи» sheet is the whole filtered set, and records what it
    // actually got. Falling back to the on-screen rows is fine — but then the
    // sheet says so, instead of looking complete.
    let exportRows = users
    let exportTotal = userTotal
    let exportComplete = userTotal !== null && users.length >= userTotal
    try {
      const full = await api.get("/api/admin/users?limit=5000")
      exportRows = full.users ?? users
      exportTotal = typeof full.total === "number" ? full.total : exportTotal
      exportComplete = exportTotal !== null && exportRows.length >= exportTotal
    } catch {
      toast({
        title: "Выгружены только загруженные строки",
        description: "Полный список получить не удалось — в файле отмечено, сколько строк из скольких.",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: User list with activity.
    //
    // The «AI запросов» / «Вещей в гардеробе» columns used to be filled from
    // limits.ai_requests / limits.wardrobe_items_anlyzed. That column is a
    // REMAINING BALANCE (limits.py decrements it on every consume), not a count
    // of anything the user did — so it was anti-correlated with the heading:
    // prod profile 1554 has 90 wardrobe items and 184 successful AI requests and
    // exported «3» for both; profile 4714 has 214 items and exported «0». And
    // 261 of 297 limits rows still sit at the untouched free value (3, 3), so
    // for most of the workbook the column was a constant.
    //
    // Usage and remaining balance are now separate, separately-labelled columns.
    // A missing limits row exports as an em-dash via n(), not as a confident 0 —
    // this file's own contract, see n() above.
    //
    // The «Тестовый» column exists because the «Метрики» sheet of this same
    // workbook states «Тестовые аккаунты исключены: N» while this query has no
    // is_test predicate — the flagged profiles were in the list, unmarked, so
    // one file used two population conventions without saying so.
    const userData = [
      [
        `Строк в выгрузке: ${exportRows.length}${
          exportTotal !== null ? ` из ${exportTotal} профилей` : ""
        }${exportComplete ? "" : " — ВЫГРУЖЕНА ЧАСТЬ СПИСКА"}`,
      ],
      [
        "Профили ≠ аккаунты: сюда попадают только заполнившие профиль; аккаунты без профиля строки не имеют.",
      ],
      [],
      [
        "ID",
        "Имя",
        "Email",
        "Тестовый",
        "Статус",
        "Кредиты",
        "Вещей в гардеробе",
        "AI-запросов использовано",
        "Фото проанализировано",
        "Осталось AI-запросов",
        "Осталось анализов фото",
        "Дата регистрации",
        "Последнее обновление",
      ],
      ...exportRows.map((user) => {
        const credits = getCurrentCredits(user)
        const subscription = getCurrentSubscription(user)
        const limits = getRemainingLimits(user)
        const status = user.is_admin
          ? "Админ"
          : subscription
          ? `Pro (${subscription.subscription_type})`
          : "Free"

        return [
          user.user_id.slice(0, 8),
          user.full_name || "Пользователь",
          user.email || "—",
          user.is_test ? "да" : "нет",
          status,
          credits,
          xl(user.wardrobe_items_count),
          xl(user.ai_requests_used),
          xl(user.photos_analyzed),
          xl(limits?.ai_requests),
          xl(limits?.wardrobe_items_anlyzed),
          new Date(user.created_at).toLocaleDateString("ru"),
          new Date(user.updated_at).toLocaleDateString("ru"),
        ]
      }),
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(userData)
    XLSX.utils.book_append_sheet(wb, ws1, "Пользователи")

    // Sheet 2: the same four numbers /admin/analytics renders, from the same
    // response. This workbook used to be built from an endpoint that did not
    // exclude test accounts, so the two admin exports reported different
    // totals for the same day.
    if (metrics) {
      const metricsData: Array<Array<string | number>> = [
        ["Метрика", "Значение"],
        ["", ""],
        ["Источник", "/api/admin/analytics (тот же, что и на странице «Аналитика»)"],
        [
          "Тестовые аккаунты исключены",
          `${n(metrics.testAccountsExcluded)} — из метрик этого листа. На листе «Пользователи» они присутствуют и помечены в колонке «Тестовый».`,
        ],
        ["", ""],
        // The two populations, as on the tile. One row called «Всего
        // пользователей» carrying the profile count is how the caption
        // «Зарегистрированных аккаунтов» came to be wrong by 160.
        ["Аккаунтов создано (авторизовались)", xl(metrics.accounts)],
        ["Из них заполнили профиль", xl(metrics.profiles)],
        ["Аккаунтов без профиля", xl(metrics.accountsWithoutProfile)],
        ["MAU (30 дней)", xl(metrics.mau)],
        [metrics.dauIsPartial ? "DAU (сегодня, неполный день)" : "DAU", xl(metrics.dau)],
        ["", ""],
        // Never the bare total: an admin grant writes the same active row a paid
        // webhook does, so "Активных подписок" on its own reads as revenue.
        ["Активных подписок (всего)", xl(metrics.activeSubscriptions)],
        ["  — из них оплачено", xl(metrics.subscriptionsPaid)],
        ["  — из них выдано админом", xl(metrics.subscriptionsGranted)],
        [
          "Оговорка по подпискам",
          "«Выдано админом» — подписки из /grant-credits и /gift. Это не выручка: у этих пользователей нет ни одного оплаченного платежа.",
        ],
        ["", ""],
        [
          "Оговорка",
          `До ${metrics.activityCutoff} активность записывалась только при платных действиях — MAU/DAU до этой даты занижены`,
        ],
      ]
      if (metrics.failedQueries > 0) {
        metricsData.push(["", ""], [
          "Внимание",
          `${metrics.failedQueries} запрос(ов) не выполнились — соответствующие значения выгружены как ${EM_DASH}`,
        ])
      }
      const ws2 = XLSX.utils.aoa_to_sheet(metricsData)
      XLSX.utils.book_append_sheet(wb, ws2, "Метрики")

      // Sheets 3-4: the zero-filled 30-day spine, so a day with no events
      // exports as 0 instead of being absent from the file.
      const activityData = [
        ["Дата", "Активных пользователей"],
        ...metrics.timeline.map((item) => [item.date, item.active_users]),
      ]
      const ws3 = XLSX.utils.aoa_to_sheet(activityData)
      XLSX.utils.book_append_sheet(wb, ws3, "Активность")

      const registrationData = [
        ["Дата", "Регистраций"],
        ...metrics.timeline.map((item) => [item.date, item.registrations]),
      ]
      const ws4 = XLSX.utils.aoa_to_sheet(registrationData)
      XLSX.utils.book_append_sheet(wb, ws4, "Регистрации")
    }

    // Export
    const date = new Date().toISOString().split("T")[0]
    XLSX.writeFile(wb, `users_activity_${date}.xlsx`)
  }

  const handleGrantCreditsOrSubscription = async () => {
    if (!selectedUser) return

    try {
      await api.post("/api/admin/grant-credits", {
        userId: selectedUser.user_id,
        credits: grantCredits ? Number.parseInt(grantCredits) : 0,
        subscriptionType: grantSubscription || null,
        subscriptionDuration: subscriptionDuration || null,
      })
      toast({
        title: "Успешно",
        description: "Кредиты/подписка успешно начислены",
      })
      setGrantCredits("")
      setGrantSubscription("")
      setSubscriptionDuration("")
      setSelectedUser(null)
      fetchUsers()
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось начислить кредиты/подписку",
        variant: "destructive",
      })
    }
  }

  const handleSendGift = async () => {
    if (!giftUser) return
    setGiftSending(true)
    try {
      const bullets = giftSheetBullets
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
      const resp = await api.post("/api/admin/gift", {
        userId: giftUser.user_id,
        credits: giftCredits ? Number.parseInt(giftCredits) : 0,
        subscriptionDuration: giftDuration || null,
        botMessage: giftBotMessage,
        welcomeSheet: {
          title: giftSheetTitle,
          body: giftSheetBody,
          bullets,
          cta_text: giftCtaText,
        },
      })
      toast({
        title: resp?.bot_sent ? "Подарок отправлен" : "Подарок выдан",
        description: resp?.bot_sent
          ? "Подписка, кредиты и уведомление в Telegram отправлены."
          : `Подписка и кредиты начислены, но Telegram-уведомление не ушло: ${resp?.bot_error || "unknown"}`,
        variant: resp?.bot_sent ? "default" : "destructive",
      })
      setGiftUser(null)
      fetchUsers()
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось выдать подарок",
        variant: "destructive",
      })
    } finally {
      setGiftSending(false)
    }
  }

  const handleResetOnboarding = async (userId: string) => {
    if (!confirm("Сбросить онбординг для этого пользователя?")) return
    try {
      await api.post("/api/admin/reset-onboarding", { userId })
      toast({
        title: "Успешно",
        description: "Онбординг сброшен. Пользователь увидит форму при следующем входе.",
      })
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось сбросить онбординг",
        variant: "destructive",
      })
    }
  }

  const getCurrentCredits = (user: User) => {
    return user.user_credits?.[0]?.credits_balance || 0
  }

  const getCurrentSubscription = (user: User) => {
    const activeSub = user.user_subscriptions?.find((sub) => sub.status === "active")
    return activeSub || null
  }

  const getRemainingLimits = (user: User) => {
    return user.limits?.[0] || null
  }

  if (loading || metricsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  // `timeline` is a server-built 30-day spine (generate_series), so every date
  // in the window is present with an explicit 0 and the cutoff is a plottable
  // category whenever it falls inside the window. Checked rather than assumed:
  // once the cutoff ages past 30 days the marker stops being drawable, and the
  // chart says so rather than silently omitting the mandated break.
  const cutoffPlottable = Boolean(
    metrics?.activityCutoff && metrics.timeline.some((t) => t.date === metrics.activityCutoff),
  )

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Управление пользователями</h1>
          <p className="text-muted-foreground mt-2">Аналитика и управление пользователями системы</p>
        </div>
        <Button onClick={exportUsersToExcel} className="gap-2" disabled={users.length === 0 || exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Экспорт в Excel
        </Button>
      </div>

      {/* Метрики */}
      {metrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Аккаунты / профили</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {/* Two numbers on purpose. The tile used to show one — the
                    profile count — captioned «Зарегистрированных аккаунтов»,
                    which was false by 160 accounts and hid the auth → profile
                    drop entirely. */}
                <div className="text-2xl font-bold">
                  {n(metrics.accounts)}
                  <span className="text-muted-foreground font-normal"> / {n(metrics.profiles)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Аккаунтов создано / заполнили профиль
                  {metrics.testAccountsExcluded !== null && (
                    <> · без тестовых ({n(metrics.testAccountsExcluded)})</>
                  )}
                </p>
                {(metrics.accountsWithoutProfile ?? 0) > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {n(metrics.accountsWithoutProfile)} авторизовались и не заполнили профиль —
                    все доли на странице «Аналитика» считаются от профилей
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MAU</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{n(metrics.mau)}</div>
                <p className="text-xs text-muted-foreground mt-1">Активных за 30 дней</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DAU</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{n(metrics.dau)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.dauIsPartial ? "Сегодня — день ещё не закончился" : "Активных за день"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Подписки</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{n(metrics.activeSubscriptions)}</div>
                {/* The total alone reads as monetization. /grant-credits and
                    /gift write the same status='active' row the payment webhook
                    does — on prod 4 of 7 active subscriptions belong to users
                    with zero paid payments. Provenance ships with the number. */}
                <p className="text-xs text-muted-foreground mt-1">
                  Активных подписок · оплачено {n(metrics.subscriptionsPaid)}, выдано админом{" "}
                  {n(metrics.subscriptionsGranted)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* The same caveat the analytics page carries. These tiles now come
              from that endpoint, so they inherit its measurement break too. */}
          {metrics.activityCutoff && (
            <p className="text-xs text-amber-700">
              MAU/DAU: до {metrics.activityCutoff} активность записывалась только при платных
              действиях, поэтому значения до этой даты — нижняя граница, а не число вернувшихся
              пользователей.
            </p>
          )}
          {metrics.failedQueries > 0 && (
            <p className="text-xs text-red-700">
              {metrics.failedQueries} запрос(ов) не выполнились — соответствующие метрики показаны
              как {EM_DASH}, а не как 0.
            </p>
          )}

          {/* Графики */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Регистрации</CardTitle>
                <CardDescription>
                  Новые пользователи за последние 30 дней. День без регистраций — явный ноль,
                  а не пропуск в ряду.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={metrics.timeline}>
                    <defs>
                      <linearGradient id="colorRegistrations" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EC9DE2" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#EC9DE2" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString("ru")}
                      formatter={(value: number) => [`${value} польз.`, "Регистраций"]}
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="registrations"
                      stroke="#EC9DE2"
                      strokeWidth={2}
                      fill="url(#colorRegistrations)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Активность</CardTitle>
                <CardDescription>
                  Активные пользователи за последние 30 дней. Пунктир —{" "}
                  {metrics.activityCutoff || EM_DASH}: слева активность записывалась только при
                  платных действиях, справа — при любом авторизованном запросе. Ряд по разные
                  стороны линии измерен по-разному и не сравним.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={metrics.timeline}>
                    <defs>
                      <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#89AEFF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#89AEFF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("ru", { month: "short", day: "numeric" })}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString("ru")}
                      formatter={(value: number) => [`${value} польз.`, "Активных"]}
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                      }}
                    />
                    {/* The break the PO mandated, on the series it actually
                        describes. The timeline is a server-built 30-day spine,
                        so the cutoff is a plottable category whenever it falls
                        inside the window; when it does not, the note below the
                        chart says so instead of drawing nothing. */}
                    {cutoffPlottable && (
                      <ReferenceLine
                        x={metrics.activityCutoff}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{
                          value: "смена инструментации",
                          position: "insideTopRight",
                          fontSize: 11,
                          fill: "#ef4444",
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="active_users"
                      stroke="#89AEFF"
                      strokeWidth={2}
                      fill="url(#colorActivity)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {!cutoffPlottable && (
                  <p className="text-xs text-amber-700 mt-2">
                    Смена инструментации ({metrics.activityCutoff || EM_DASH}) вне окна графика —
                    линия разрыва не нарисована. Весь показанный ряд измерен по одним правилам.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Таблица пользователей */}
      <Card>
        <CardHeader>
          {/* «Пользователи (200)» printed the LIMIT as the population. It is a
              slice of the profiles, and the profiles are themselves a subset of
              the accounts — both facts belong in the header. */}
          <CardTitle>
            Пользователи
            {userTotal !== null && users.length < userTotal
              ? ` — показано ${n(users.length)} из ${n(userTotal)}`
              : ` (${n(users.length)})`}
          </CardTitle>
          <CardDescription>
            Профили пользователей ({n(userTotal ?? users.length)}).
            {metrics?.accounts != null && (
              <> Всего аккаунтов — {n(metrics.accounts)}: аккаунты без профиля строки здесь не имеют.</>
            )}
            {userTotal !== null && users.length < userTotal && (
              <> В таблице первые {n(users.length)} по дате регистрации; экспорт выгружает весь список.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Пользователь</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Кредиты</TableHead>
                <TableHead>Использовано</TableHead>
                <TableHead>Остаток лимитов</TableHead>
                <TableHead>Дата регистрации</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const credits = getCurrentCredits(user)
                const subscription = getCurrentSubscription(user)
                const limits = getRemainingLimits(user)

                return (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <a
                          href={`/admin/users/${user.user_id}`}
                          className="font-medium text-[#B97DC6] hover:underline"
                          title="Открыть таймлайн пользователя"
                        >
                          {user.full_name || "Пользователь"}
                        </a>
                        <span className="text-xs text-muted-foreground">{user.user_id.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{user.email || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.is_test && (
                          <Badge variant="outline" title="Исключён из всех метрик на «Аналитике»">
                            Тестовый
                          </Badge>
                        )}
                        {user.is_admin && <Badge variant="destructive">Админ</Badge>}
                        {subscription && (
                          <Badge variant="default" className="bg-purple-600">
                            {subscription.subscription_type === "pro" ? "Pro" : subscription.subscription_type}
                          </Badge>
                        )}
                        {!user.is_admin && !subscription && <Badge variant="secondary">Free</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-[#B97DC6]">{credits}</span>
                    </TableCell>
                    {/* What the user actually did. These two columns used to be
                        one column of limits.* values labelled «Лимиты», which is
                        a remaining balance — so a user with 90 wardrobe items
                        showed «Гардероб: 3». Usage and remainder are now split
                        and each says which one it is. */}
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        <div>Вещей: {n(user.wardrobe_items_count)}</div>
                        <div>AI: {n(user.ai_requests_used)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {limits ? (
                        <div className="text-xs space-y-0.5 text-muted-foreground">
                          <div>AI: {limits.ai_requests}</div>
                          <div>Анализов фото: {limits.wardrobe_items_anlyzed}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{EM_DASH}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), { addSuffix: true, locale: ru })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetOnboarding(user.user_id)}
                        disabled={user.is_admin}
                        title="Сбросить онбординг"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedUser(user)}
                            disabled={user.is_admin}
                          >
                            Начислить
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Начислить кредиты/подписку</DialogTitle>
                          </DialogHeader>

                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="credits">Кредиты</Label>
                              <Input
                                id="credits"
                                type="number"
                                placeholder="Количество кредитов"
                                value={grantCredits}
                                onChange={(e) => setGrantCredits(e.target.value)}
                              />
                            </div>

                            <div>
                              <Label htmlFor="subscription">Подписка</Label>
                              <Select value={grantSubscription} onValueChange={setGrantSubscription}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Выберите подписку" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pro">Pro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {grantSubscription && (
                              <div>
                                <Label htmlFor="duration">Длительность</Label>
                                <Select value={subscriptionDuration} onValueChange={setSubscriptionDuration}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Выберите длительность" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="monthly">1 месяц</SelectItem>
                                    <SelectItem value="yearly">1 год</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            <Button
                              onClick={handleGrantCreditsOrSubscription}
                              className="w-full"
                              disabled={!grantCredits && !grantSubscription}
                            >
                              Начислить
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setGiftUser(user)}
                        disabled={user.is_admin}
                        title="Подарок: подписка + кредиты + уведомление в боте + welcome-шторка"
                      >
                        🎁
                      </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!giftUser} onOpenChange={(o) => !o && setGiftUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🎁 Подарок {giftUser?.full_name || ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="gift-credits">Кредиты</Label>
                <Input
                  id="gift-credits"
                  type="number"
                  value={giftCredits}
                  onChange={(e) => setGiftCredits(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gift-duration">Подписка</Label>
                <Select value={giftDuration} onValueChange={(v) => setGiftDuration(v as any)}>
                  <SelectTrigger id="gift-duration">
                    <SelectValue placeholder="Без подписки" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">1 месяц</SelectItem>
                    <SelectItem value="yearly">1 год</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="gift-bot-msg">Сообщение в Telegram (HTML)</Label>
              <Textarea
                id="gift-bot-msg"
                rows={4}
                value={giftBotMessage}
                onChange={(e) => setGiftBotMessage(e.target.value)}
                placeholder="{credits} и {duration_ru} подставятся автоматом"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Плейсхолдеры: <code>{"{credits}"}</code>, <code>{"{duration_ru}"}</code>
              </p>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Welcome-шторка в приложении</p>
              <div className="space-y-2">
                <div>
                  <Label htmlFor="gift-title">Заголовок</Label>
                  <Input
                    id="gift-title"
                    value={giftSheetTitle}
                    onChange={(e) => setGiftSheetTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gift-body">Подзаголовок</Label>
                  <Textarea
                    id="gift-body"
                    rows={2}
                    value={giftSheetBody}
                    onChange={(e) => setGiftSheetBody(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gift-bullets">Буллеты (по одному на строку)</Label>
                  <Textarea
                    id="gift-bullets"
                    rows={4}
                    value={giftSheetBullets}
                    onChange={(e) => setGiftSheetBullets(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="gift-cta">Текст кнопки</Label>
                  <Input
                    id="gift-cta"
                    value={giftCtaText}
                    onChange={(e) => setGiftCtaText(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleSendGift} className="w-full" disabled={giftSending}>
              {giftSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отправить подарок"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
