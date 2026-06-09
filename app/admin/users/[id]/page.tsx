"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api-client"
import { ChevronLeft } from "lucide-react"

interface Timeline {
  user: {
    user_id: string
    email: string
    full_name: string
    telegram_username: string
    gender: string | null
    dominant_style: string | null
    onboarding_complete: boolean
  }
  funnel: {
    signup_at: string | null
    first_item_at: string | null
    wardrobe_count: number
    first_outfit_at: string | null
    first_look_at: string | null
    first_paid_at: string | null
  }
  subscription: {
    subscription_type: string
    status: string
    start_date: string | null
    expires_at: string | null
    credits_included: number
  } | null
  credits: number
  payments: Array<{ amount: number; status: string; action: string | null; type: string | null; created_at: string }>
  activity: Array<{ date: string; count: number }>
  events: Array<{ at: string; feature: string; action: string; count: number }>
}

function fmt(dt: string | null): string {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return dt
  }
}

// Relative time from registration → milestone ("+2 ч", "+3 дн")
function since(from: string | null, to: string | null): string {
  if (!from || !to) return ""
  const ms = new Date(to).getTime() - new Date(from).getTime()
  if (isNaN(ms) || ms < 0) return ""
  const h = ms / 3_600_000
  if (h < 1) return `+${Math.round(ms / 60000)} мин`
  if (h < 48) return `+${Math.round(h)} ч`
  return `+${Math.round(h / 24)} дн`
}

export default function UserTimelinePage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || "")
  const [data, setData] = useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        setLoading(true)
        const d = await api.get(`/api/admin/users/${id}/timeline`)
        setData(d)
      } catch {
        setError("Не удалось загрузить данные пользователя")
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading) return <div className="p-6">Загрузка…</div>
  if (error || !data) return <div className="p-6 text-red-600">{error || "Нет данных"}</div>

  const f = data.funnel
  const milestones = [
    { label: "Регистрация", at: f.signup_at, rel: "" },
    { label: "Загрузил гардероб (1-е целевое действие)", at: f.first_item_at, rel: since(f.signup_at, f.first_item_at) },
    { label: "Первый образ", at: f.first_outfit_at, rel: since(f.signup_at, f.first_outfit_at) },
    { label: "Сохранил образ", at: f.first_look_at, rel: since(f.signup_at, f.first_look_at) },
    { label: "💳 Решение оплатить", at: f.first_paid_at, rel: since(f.signup_at, f.first_paid_at) },
  ]

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.push("/admin/users")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> К пользователям
      </button>

      {/* Header */}
      <div className="rounded-xl border p-4">
        <div className="text-lg font-semibold">{data.user.full_name || "Без имени"}</div>
        <div className="text-sm text-muted-foreground">
          {data.user.email}
          {data.user.telegram_username ? ` · @${data.user.telegram_username}` : ""}
        </div>
        <div className="text-sm mt-2 flex flex-wrap gap-2">
          {data.user.gender && <span className="rounded-full bg-gray-100 px-2 py-0.5">{data.user.gender}</span>}
          {data.user.dominant_style && <span className="rounded-full bg-gray-100 px-2 py-0.5">{data.user.dominant_style}</span>}
          <span className={`rounded-full px-2 py-0.5 ${data.user.onboarding_complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {data.user.onboarding_complete ? "онбординг завершён" : "онбординг не завершён"}
          </span>
          <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5">{data.credits} кредитов</span>
        </div>
      </div>

      {/* Activation funnel */}
      <div className="rounded-xl border p-4">
        <div className="font-semibold mb-3">Воронка активации</div>
        <ol className="space-y-2">
          {milestones.map((m, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className={`text-sm ${m.at ? "text-foreground" : "text-muted-foreground/50"}`}>{m.label}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {fmt(m.at)}
                {m.rel && <span className="text-emerald-600 ml-1">{m.rel}</span>}
              </span>
            </li>
          ))}
        </ol>
        <div className="text-sm text-muted-foreground mt-3">
          Вещей в гардеробе: <b className="text-foreground">{f.wardrobe_count}</b>
        </div>
      </div>

      {/* Subscription */}
      {data.subscription && (
        <div className="rounded-xl border p-4">
          <div className="font-semibold mb-2">Подписка</div>
          <div className="text-sm">
            {data.subscription.subscription_type} · {data.subscription.status} · до {fmt(data.subscription.expires_at)}
            {` · включено ${data.subscription.credits_included} кредитов`}
          </div>
        </div>
      )}

      {/* Payments */}
      <div className="rounded-xl border p-4">
        <div className="font-semibold mb-2">Платежи ({data.payments.length})</div>
        {data.payments.length === 0 ? (
          <div className="text-sm text-muted-foreground">Платежей нет</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.payments.map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{fmt(p.created_at)}</td>
                  <td>{p.action === "subscribe" ? `подписка ${p.type || ""}` : "кредиты"}</td>
                  <td className="text-right tabular-nums">{p.amount} ₽</td>
                  <td className={`text-right ${p.status === "paid" ? "text-emerald-600" : "text-muted-foreground"}`}>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Event stream */}
      <div className="rounded-xl border p-4">
        <div className="font-semibold mb-2">Активность (последние 100 событий)</div>
        {data.events.length === 0 ? (
          <div className="text-sm text-muted-foreground">Событий пока нет</div>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-auto text-sm">
            {data.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {e.feature}
                  {e.action && e.action !== "track" ? ` · ${e.action}` : ""}
                </span>
                <span className="text-muted-foreground tabular-nums">{fmt(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
