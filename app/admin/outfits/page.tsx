"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { api } from "@/lib/api-client"

type OutfitListItem = {
  id: number
  name?: string | null
  description?: string | null
  preview_image_url?: string | null
  preview_url?: string | null
  created_at?: string
  likes_count?: number
  saves_count?: number
  views_count?: number
  gender?: string | null
}

type VibeCircle = { vibe: string; count: number; cover: string | null }

type LookbookResult = {
  requested: number
  generated: number
  total_cost_usd: number
  unpriced_generations: number
  budget_usd: number
  results: { outfit_id: number; status: string; cost_usd?: number | null }[]
}

// Замер 2026-08-17: кадр 3:4 стоит столько (1120 image-токенов по $0.00006 плюс
// промпт). Нужен, чтобы показать смету ДО запуска: кнопка тратит живые деньги.
const COST_PER_FRAME_USD = 0.0686
// Кадр идёт ~30 секунд (генерация плюс ретраи чтения цены), а запрос синхронный,
// поэтому по умолчанию берём маленькую пачку: пять кадров ≈ 2,5 минуты ожидания.
const DEFAULT_LIMIT = 5

/** Генерация кадров ИИ-моделей для курируемой витрины (outfits.vibe). */
function LookbookPanel() {
  const [vibes, setVibes] = useState<VibeCircle[]>([])
  const [vibe, setVibe] = useState("")
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [budget, setBudget] = useState(1)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<LookbookResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api
      .get("/api/outfits/inspiration/vibes")
      .then((d) => setVibes(d?.vibes ?? []))
      .catch(() => setVibes([]))
  }, [])

  // Смета по верхней границе: сколько кадров закажем, столько и посчитали.
  // Реально спишется меньше, если у части образов превью уже сгенерировано.
  const estimate = Math.min(limit * COST_PER_FRAME_USD, budget)

  async function run() {
    const ok = window.confirm(
      `Сгенерировать до ${limit} кадров${vibe ? ` для кружка «${vibe}»` : ""}?\n\n` +
        `Это платно: примерно $${estimate.toFixed(2)} (кадр $${COST_PER_FRAME_USD}).\n` +
        `Жёсткий потолок — $${budget}, дальше генерация остановится сама.\n\n` +
        `Займёт около ${Math.ceil((limit * 30) / 60)} мин, вкладку не закрывать.`,
    )
    if (!ok) return
    setRunning(true)
    setErr(null)
    setResult(null)
    try {
      const data = await api.post("/api/admin/outfits/lookbook", {
        vibe: vibe || undefined,
        limit,
        max_cost_usd: budget,
      })
      setResult(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сгенерировать")
    } finally {
      setRunning(false)
    }
  }

  const byStatus = (result?.results ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Лукбуки витрины</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Заменяет товарное превью курируемого образа на кадр ИИ-модели в этих вещах. Образы, у
          которых кадр уже есть, пропускаются.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Кружок</span>
            <select
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              disabled={running}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Все кружки</option>
              {vibes.map((v) => (
                <option key={v.vibe} value={v.vibe}>
                  {v.vibe} ({v.count})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Сколько кадров</span>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              disabled={running}
              className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Потолок, $</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={budget}
              onChange={(e) => setBudget(Math.max(0.1, Number(e.target.value) || 0.1))}
              disabled={running}
              className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
            />
          </label>

          <Button onClick={run} disabled={running}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {running ? "Генерирую…" : `Сгенерировать · ≈ $${estimate.toFixed(2)}`}
          </Button>
        </div>

        {running && (
          <p className="text-sm text-muted-foreground">
            Кадры идут по одному, около 30 секунд каждый — так работает сторож бюджета. Если
            закрыть вкладку, генерация на сервере всё равно доработает до потолка.
          </p>
        )}

        {err && <p className="text-sm font-medium text-red-600">Ошибка: {err}</p>}

        {result && (
          <div className="rounded-md border p-3 text-sm">
            <p>
              Готово: <b>{result.generated}</b> из {result.requested}, потрачено{" "}
              <b>${result.total_cost_usd}</b> при потолке ${result.budget_usd}.
            </p>
            <p className="mt-1 text-muted-foreground">
              {Object.entries(byStatus)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
              {result.unpriced_generations > 0 &&
                ` · без цены: ${result.unpriced_generations} (посчитаны по замеру)`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminOutfitsPage() {
  const [outfits, setOutfits] = useState<OutfitListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.get("/api/outfits")
        // Support either { outfits } or plain array
        const list: OutfitListItem[] = Array.isArray(data) ? data : (data.outfits ?? [])
        if (active) setOutfits(list)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unknown error")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  // Ранние return'ы тут были на всю страницу, из-за чего панель лукбуков была
  // недоступна, пока грузится список — и вовсе недоступна, если список упал.
  // Панель от списка не зависит, поэтому состояния показываем только вместо него.
  if (loading || error) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Образы</h1>
        </div>
        <LookbookPanel />
        {loading ? (
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загрузка образов...</span>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-red-600 font-medium mb-3">Ошибка: {error}</p>
            <Button onClick={() => location.reload()}>Обновить</Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Образы</h1>
      </div>
      <LookbookPanel />
      {outfits.length === 0 ? (
        <div className="text-center text-muted-foreground">Образы не найдены</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {outfits.map((o) => {
            const preview =
              (o.preview_image_url && o.preview_image_url.trim()) || (o.preview_url && o.preview_url.trim()) || ""
            const src = preview || "/placeholder.svg?height=200&width=160"
            return (
              <Link key={o.id} href={`/admin/outfits/${o.id}`} className="block">
                <Card className="hover:shadow-md transition">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base truncate">{o.name || "Без названия"}</CardTitle>
                    {o.gender && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {o.gender === "male" ? "Мужской" : o.gender === "female" ? "Женский" : "Унисекс"}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="w-full aspect-[4/5] bg-muted rounded-md overflow-hidden flex items-center justify-center">
                      {preview ? (
                        <img
                          src={src || "/placeholder.svg"}
                          alt="Outfit preview"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <svg className="h-8 w-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path
                              d="M3 3l18 18M21 15V5a2 2 0 00-2-2H9"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M3 9v10a2 2 0 002 2h10"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="text-xs">Нет превью</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>❤️ {o.likes_count ?? 0}</span>
                      <span>🔖 {o.saves_count ?? 0}</span>
                      <span>👁️ {o.views_count ?? 0}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
