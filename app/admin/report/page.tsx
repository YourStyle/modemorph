"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList, Legend } from "recharts"
import * as XLSX from "xlsx"
import { api } from "@/lib/api-client"

// Фирменные токены из app/globals.css (контракт test/gauntlet/design/BAR.md):
// тёплая бумага, чернила, ровно один акцент — вермильон.
const C = { canvas: "#F9F8F5", sunk: "#F2EFEB", ink: "#121212", ink2: "#6B6B6B", ink3: "#A3A3A3", line: "#E6E2DD", signal: "#FF4D1F" }
const W = 698 // ширина контента A4 (794px) минус поля; фиксированная, чтобы печать не зависела от ResizeObserver

interface Report {
  kpi: {
    accounts: number; profiles: number; accounts_30d: number; accounts_prev_30d: number
    active_7d: number; active_30d: number; payers: number; paid_payments: number
    abandoned_checkout_users: number; revenue: number | null
  }
  steps: { item1: number; item5: number; item15: number; look1: number; paid: number }
  monthly: { month: string; accounts: number; profiles: number }[]
  weekly_active: { week: string; active: number }[]
  recency: { bucket: string; users: number }[]
  wardrobe_size: { bucket: string; users: number }[]
  features_30d: { feature: string; action: string; events: number; users: number }[]
  paywall: { source: string; shows: number; users: number }[]
  meta: { activity_cutoff: string; min_payers_for_revenue: number }
}

const FEATURE: Record<string, string> = {
  wardrobe_items_anlyzed: "Оцифровка фото", photo_detection: "Распознавание вещей", ai_requests: "AI-ассистент",
  ai_assistant_used: "AI-ассистент", ideas_viewed: "Идеи", outfits_saved: "Сохранение образа", outfit_created: "Создание образа",
  user_look: "Образ", vton_used: "Примерка", paywall_shown: "Пейволл", push_open: "Пуш", wardrobe_item: "Вещь",
  outfit_accessory: "Аксессуар к образу", registration_step: "Регистрация",
}
const PAYWALL: Record<string, string> = {
  "limit:wardrobe_items_anlyzed": "Лимит оцифровки", "limit:home": "Лимит на главной", explore: "Витрина",
}
const ACTION: Record<string, string> = {
  detected: "распознано", consume_success: "успешно", click: "нажатие", view: "показ", shown: "показ", attempt: "попытка",
  track: "использование", create: "создание", delete: "удаление", create_manual: "вручную", complete: "завершено", submit: "отправка",
}
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ru-RU"))
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—")
const monthLabel = (m: string) => `${MONTHS[+m.slice(5) - 1]} ${m.slice(2, 4)}`
const dayLabel = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}`
const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })

// ponytail: правила-эвристики, не прогноз. Расширять, когда появятся цели по метрикам.
function signals(r: Report): string[] {
  const k = r.kpi, out: string[] = []
  if (k.accounts_prev_30d) {
    const d = Math.round(((k.accounts_30d - k.accounts_prev_30d) / k.accounts_prev_30d) * 100)
    out.push(`Новых аккаунтов за 30 дней — ${k.accounts_30d}, это ${d >= 0 ? "+" : ""}${d}% к предыдущим 30 дням.`)
  }
  const peak = r.monthly.reduce((a, b) => (b.accounts > a.accounts ? b : a), r.monthly[0])
  if (peak) out.push(`Пик притока — ${monthLabel(peak.month)} (${peak.accounts} аккаунтов).`)
  out.push(`За 30 дней заходили ${k.active_30d} из ${k.profiles} профилей (${pct(k.active_30d, k.profiles)}).`)
  const noProfile = k.accounts - k.profiles
  out.push(`${noProfile} аккаунтов (${pct(noProfile, k.accounts)}) так и не заполнили профиль — самый большой обрыв.`)
  out.push(`Хотя бы одну вещь добавили ${pct(r.steps.item1, k.profiles)} профилей, 15+ вещей — ${pct(r.steps.item15, k.profiles)}.`)
  if (k.abandoned_checkout_users) out.push(`${k.abandoned_checkout_users} человек начали оплату и не завершили её.`)
  return out
}

function exportXlsx(r: Report) {
  const wb = XLSX.utils.book_new()
  const sheet = (name: string, rows: object[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
  sheet("KPI", Object.entries(r.kpi).map(([k, v]) => ({ метрика: k, значение: v })))
  sheet("По месяцам", r.monthly)
  sheet("Активные по неделям", r.weekly_active)
  sheet("Активация", Object.entries(r.steps).map(([k, v]) => ({ шаг: k, профилей: v })))
  sheet("Давность захода", r.recency)
  sheet("Размер гардероба", r.wardrobe_size)
  sheet("Фичи 30 дней", r.features_30d)
  sheet("Пейволл", r.paywall)
  XLSX.writeFile(wb, `modemorph_users_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const Sheet = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <section className="sheet" style={{ width: 794, minHeight: 1123, padding: "44px 48px 56px", background: C.canvas, position: "relative" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${C.ink}`, paddingBottom: 10, marginBottom: 28 }}>
      <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>ModeMorph<span style={{ color: C.signal }}>.</span></span>
      <span style={{ fontSize: 11, color: C.ink2, letterSpacing: "0.08em", textTransform: "uppercase" }}>Отчёт по пользователям · {today}</span>
    </header>
    {children}
    <footer style={{ position: "absolute", bottom: 24, left: 48, right: 48, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.ink3 }}>
      <span>Тестовые аккаунты исключены</span><span>{n}</span>
    </footer>
  </section>
)

const H = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div style={{ margin: "28px 0 12px" }}>
    <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>{children}</h2>
    {sub && <p style={{ fontSize: 11, color: C.ink2, margin: "4px 0 0" }}>{sub}</p>}
  </div>
)

const Kpi = ({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) => (
  <div style={{ background: accent ? C.ink : "#fff", color: accent ? "#fff" : C.ink, border: `1px solid ${accent ? C.ink : C.line}`, borderRadius: 14, padding: "14px 16px" }}>
    <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>{label}</div>
    <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", margin: "6px 0 2px", color: accent ? C.signal : C.ink }}>{value}</div>
    {note && <div style={{ fontSize: 11, opacity: 0.6 }}>{note}</div>}
  </div>
)

const axis = { tick: { fontSize: 10, fill: C.ink2 }, axisLine: { stroke: C.line }, tickLine: false } as const

function HBars({ data, total }: { data: { label: string; value: number }[]; total: number }) {
  return (
    <div>
      {data.map((d, i) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "190px 1fr 90px", alignItems: "center", gap: 12, marginBottom: 8, fontSize: 12 }}>
          <span>{d.label}</span>
          <div style={{ background: C.sunk, height: 18, borderRadius: 4 }}>
            <div style={{ width: `${Math.max((d.value / total) * 100, 0.8)}%`, height: "100%", borderRadius: 4, background: i === data.length - 1 ? C.signal : C.ink }} />
          </div>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}><b>{fmt(d.value)}</b> <span style={{ color: C.ink2 }}>{pct(d.value, total)}</span></span>
        </div>
      ))}
    </div>
  )
}

const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
    <thead><tr>{head.map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: C.ink2, fontWeight: 600, padding: "6px 0", borderBottom: `1px solid ${C.ink}` }}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: j ? "right" : "left", padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontVariantNumeric: "tabular-nums" }}>{typeof c === "number" ? fmt(c) : c}</td>)}</tr>)}</tbody>
  </table>
)

function ReportBody({ r }: { r: Report }) {
  const k = r.kpi
  const last = r.weekly_active.length - 1
  return (
    <>
      <Sheet n={1}>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05, margin: "8px 0 6px" }}>Пользователи<br />ModeMorph</h1>
        <p style={{ fontSize: 13, color: C.ink2, margin: "0 0 24px" }}>Приток, активация, активность и деньги. Срез на {today}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <Kpi label="Аккаунтов" value={fmt(k.accounts)} note={`${fmt(k.profiles)} заполнили профиль`} />
          <Kpi label="Новых за 30 дней" value={fmt(k.accounts_30d)} note={`против ${fmt(k.accounts_prev_30d)} месяцем ранее`} />
          <Kpi label="Активны за 7 дней" value={fmt(k.active_7d)} note={`${fmt(k.active_30d)} за 30 дней`} accent />
          <Kpi label="Платящих" value={fmt(k.payers)} note={`${fmt(k.paid_payments)} оплат за всё время`} />
          <Kpi label="Бросили оплату" value={fmt(k.abandoned_checkout_users)} note="начали и не оплатили ни разу" />
          <Kpi label="Выручка" value={k.revenue == null ? "—" : `${fmt(Math.round(k.revenue))} ₽`}
            note={k.revenue == null ? `скрыта до ${r.meta.min_payers_for_revenue} платящих` : "за всё время"} />
        </div>
        <H sub="Новые аккаунты и сколько из них заполнили профиль, по месяцам регистрации">Приток</H>
        <BarChart width={W} height={250} data={r.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 16, right: 0, left: -24, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={C.line} />
          <XAxis dataKey="label" {...axis} interval={0} />
          <YAxis {...axis} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="accounts" name="Аккаунты" fill={C.ink3} isAnimationActive={false} radius={[3, 3, 0, 0]} />
          <Bar dataKey="profiles" name="С профилем" fill={C.ink} isAnimationActive={false} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="accounts" position="top" style={{ fontSize: 9, fill: C.ink2 }} />
          </Bar>
        </BarChart>
        <H>Сигналы</H>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 12.5, lineHeight: 1.55 }}>
          {signals(r).map((s) => <li key={s} style={{ display: "flex", gap: 10, marginBottom: 4 }}><span style={{ color: C.signal, fontWeight: 800 }}>—</span>{s}</li>)}
        </ul>
      </Sheet>

      <Sheet n={2}>
        <H sub={`Уникальные профили, открывавшие приложение за неделю. Ряд начинается после ${dayLabel(r.meta.activity_cutoff)}: раньше заход не записывался, только платные действия. Последняя неделя — неполная.`}>Активные по неделям</H>
        <BarChart width={W} height={200} data={r.weekly_active.map((w) => ({ ...w, label: dayLabel(w.week) }))} margin={{ top: 16, right: 0, left: -24, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.line} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} allowDecimals={false} />
          <Bar dataKey="active" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {r.weekly_active.map((_, i) => <Cell key={i} fill={i === last ? C.signal : C.ink} />)}
            <LabelList dataKey="active" position="top" style={{ fontSize: 10, fill: C.ink }} />
          </Bar>
        </BarChart>
        <H sub="Сколько профилей дошли до шага. Доли — от всех профилей; шаги не вложены друг в друга">Активация</H>
        <HBars total={k.profiles} data={[
          { label: "Заполнили профиль", value: k.profiles },
          { label: "Добавили 1+ вещь", value: r.steps.item1 },
          { label: "5+ вещей", value: r.steps.item5 },
          { label: "15+ вещей", value: r.steps.item15 },
          { label: "Собрали образ", value: r.steps.look1 },
          { label: "Оплатили", value: r.steps.paid },
        ]} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
          <div>
            <H sub="Последний заход профиля">Давность</H>
            <Table head={["Когда", "Профилей", "Доля"]} rows={r.recency.map((x) => [x.bucket, x.users, pct(x.users, k.profiles)])} />
          </div>
          <div>
            <H sub="Вещей в гардеробе у профиля">Размер гардероба</H>
            <Table head={["Вещей", "Профилей", "Доля"]} rows={r.wardrobe_size.map((x) => [x.bucket, x.users, pct(x.users, k.profiles)])} />
          </div>
        </div>
      </Sheet>

      <Sheet n={3}>
        <H sub="События usage_events за 30 дней, по числу уникальных пользователей">Чем пользуются</H>
        <Table head={["Фича", "Действие", "Событий", "Людей"]}
          rows={r.features_30d.map((f) => [FEATURE[f.feature] ?? f.feature, ACTION[f.action] ?? f.action, f.events, f.users])} />
        <H sub="Где пользователь упирается в оплату, за всё время">Пейволл</H>
        <Table head={["Источник", "Показов", "Людей"]} rows={r.paywall.map((p) => [PAYWALL[p.source] ?? p.source, p.shows, p.users])} />
        <H>Как считали</H>
        <ul style={{ fontSize: 11, color: C.ink2, lineHeight: 1.6, paddingLeft: 16, margin: 0, listStyle: "disc" }}>
          <li>Аккаунт — любой, кто авторизовался. Профиль — кто после этого отправил анкету. Доли активации считаются от профилей.</li>
          <li>Активность — таблица daily_user_activity. До {dayLabel(r.meta.activity_cutoff)} она писалась только на платных действиях, поэтому недельный ряд начинается после этой даты.</li>
          <li>Выручка показывается, когда платящих не меньше {r.meta.min_payers_for_revenue}: на меньшей выборке её не с чем сравнивать.</li>
          <li>Тестовые профили (is_test) исключены из всех цифр.</li>
        </ul>
      </Sheet>
    </>
  )
}

export default function ReportPage() {
  const [r, setR] = useState<Report | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    api.get("/api/admin/report").then(setR).catch((e) => setErr(String(e?.message ?? e)))
  }, [])
  if (!mounted) return null

  // Портал в body: при печати прячем всё остальное (сайдбар админки и её
  // скролл-контейнер обрезали бы отчёт по первой странице).
  return createPortal(
    <div id="report-root" style={{ position: "fixed", inset: 0, overflow: "auto", background: "#E9E6E1", zIndex: 60, fontFamily: "Manrope, sans-serif", color: C.ink }}>
      <style>{`
        @page { size: A4; margin: 0 }
        @media print {
          body > *:not(#report-root) { display: none !important }
          #report-root { position: static !important; overflow: visible !important; background: none !important }
          .no-print { display: none !important }
          .sheet { margin: 0 !important; box-shadow: none !important; break-after: page }
          .sheet:last-child { break-after: auto }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
        }
        .sheet { margin: 0 auto 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
      `}</style>
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", gap: 8, justifyContent: "center", alignItems: "center", padding: 12, background: "rgba(233,230,225,.92)", backdropFilter: "blur(6px)", marginBottom: 12 }}>
        <Link href="/admin/analytics" style={{ fontSize: 13, color: C.ink2, marginRight: "auto" }}>← Аналитика</Link>
        <button onClick={() => window.print()} disabled={!r} style={{ background: C.ink, color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Скачать PDF</button>
        <button onClick={() => r && exportXlsx(r)} disabled={!r} style={{ background: "#fff", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", marginRight: "auto" }}>Excel</button>
      </div>
      {err && <p style={{ textAlign: "center", color: C.signal }}>Не удалось загрузить отчёт: {err}</p>}
      {!r && !err && <p style={{ textAlign: "center", color: C.ink2 }}>Собираю отчёт…</p>}
      {r && <ReportBody r={r} />}
    </div>,
    document.body,
  )
}
