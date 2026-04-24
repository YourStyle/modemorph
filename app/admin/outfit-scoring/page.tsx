"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Search, X, Check, AlertTriangle, Zap, Image as ImageIcon,
  Sparkles as SparklesIcon,
} from "lucide-react"
import { api } from "@/lib/api-client"
import { toast } from "sonner"

type Item = {
  id: number
  name: string | null
  image_url: string | null
  clothing_type: string | null
  color: string | null
  source?: "catalog" | "user"
}

type ScoreResult = {
  requested_ids: number[]
  resolved_count: number
  score: number | null
  n_items_used: number
  skipped?: number[]
  reason?: string
}

type Preset = {
  outfit_id: number | null
  title: string
  occasion: string | null
  kind: "real" | "synthetic"
  items: Item[]
  score?: number | null
  scoring?: boolean
  error?: string
}

function scoreBand(score: number | null | undefined): { label: string; className: string } {
  if (score === null || score === undefined) return { label: "—", className: "bg-gray-100 text-gray-600" }
  if (score >= 0.8) return { label: "Отличная сочетаемость", className: "bg-green-100 text-green-800" }
  if (score >= 0.65) return { label: "Хорошая", className: "bg-emerald-100 text-emerald-800" }
  if (score >= 0.5) return { label: "Средняя", className: "bg-amber-100 text-amber-800" }
  if (score >= 0.35) return { label: "Слабая", className: "bg-orange-100 text-orange-800" }
  return { label: "Плохая сочетаемость", className: "bg-red-100 text-red-800" }
}

const PAGE_SIZE = 60

export default function OutfitScoringAdminPage() {
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [typeCounts, setTypeCounts] = useState<{ clothing_type: string; n: number }[]>([])
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [userItems, setUserItems] = useState<Item[]>([])
  const [hasMoreCatalog, setHasMoreCatalog] = useState(false)
  const [hasMoreUser, setHasMoreUser] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<Item[]>([])
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [scoring, setScoring] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [modelStatus, setModelStatus] = useState<{ ready: boolean; loaded_at?: string; device?: string; error?: string } | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [loadingPresets, setLoadingPresets] = useState(true)

  // Build a common URL for search-items requests so pagination and filters
  // stay in sync between the initial fetch, debounced search, and "show more".
  const buildItemsUrl = useCallback(
    (opts: { q: string; types: string[]; offset: number; limit: number }) => {
      const params = new URLSearchParams()
      if (opts.q) params.set("q", opts.q)
      params.set("limit", String(opts.limit))
      params.set("offset", String(opts.offset))
      for (const t of opts.types) params.append("clothing_types", t)
      return `/api/admin/outfit-scorer/search-items?${params.toString()}`
    },
    [],
  )

  // Fetch presets once on mount — independent of search state.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const presetsRes = await api.get<{ presets: Preset[] }>(
          `/api/admin/outfit-scorer/presets?count=5`,
        )
        if (!cancelled) setPresets(presetsRes.presets || [])
      } catch (e: any) {
        if (!cancelled) toast.error(`Пресеты не загрузились: ${e?.message || e}`)
      } finally {
        if (!cancelled) setLoadingPresets(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Fresh search whenever query / filter changes (debounced). Always resets
  // pagination back to offset=0 and replaces accumulated items.
  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get<{
          catalog: Item[]; user: Item[];
          has_more_catalog: boolean; has_more_user: boolean;
          type_counts: { clothing_type: string; n: number }[];
        }>(buildItemsUrl({ q: query, types: typeFilter, offset: 0, limit: PAGE_SIZE }))
        setCatalogItems(res.catalog)
        setUserItems(res.user)
        setHasMoreCatalog(res.has_more_catalog)
        setHasMoreUser(res.has_more_user)
        if (res.type_counts?.length) setTypeCounts(res.type_counts)
      } catch (e: any) {
        toast.error(`Поиск не удался: ${e?.message || e}`)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, typeFilter, buildItemsUrl])

  const loadMore = async (source: "catalog" | "user") => {
    setLoadingMore(true)
    try {
      const currentLen = source === "catalog" ? catalogItems.length : userItems.length
      const res = await api.get<{ catalog: Item[]; user: Item[]; has_more_catalog: boolean; has_more_user: boolean }>(
        buildItemsUrl({ q: query, types: typeFilter, offset: currentLen, limit: PAGE_SIZE })
          + `&sources=${source}`,
      )
      if (source === "catalog") {
        setCatalogItems((prev) => [...prev, ...res.catalog])
        setHasMoreCatalog(res.has_more_catalog)
      } else {
        setUserItems((prev) => [...prev, ...res.user])
        setHasMoreUser(res.has_more_user)
      }
    } catch (e: any) {
      toast.error(`Не удалось подгрузить: ${e?.message || e}`)
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleType = (t: string) => {
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const toggleItem = (item: Item) => {
    setSelected((prev) => {
      const key = `${item.source ?? "catalog"}:${item.id}`
      const exists = prev.find((p) => `${p.source ?? "catalog"}:${p.id}` === key)
      if (exists) return prev.filter((p) => `${p.source ?? "catalog"}:${p.id}` !== key)
      if (prev.length >= 16) {
        toast.error("Максимум 16 вещей — предел OutfitTransformer")
        return prev
      }
      return [...prev, item]
    })
  }

  const handleLoadModel = async () => {
    setLoadingModel(true)
    toast.info("Загрузка модели — первый запуск качает 1.1 ГБ с Google Drive, это долго.")
    try {
      const res = await api.post<{ ready: boolean; loaded_at?: string; device?: string; error?: string }>(
        "/api/admin/outfit-scorer/load", {},
      )
      setModelStatus(res)
      if (res.ready) toast.success(`Модель готова (${res.device})`)
      else toast.error(`Не удалось загрузить: ${res.error || "неизвестная ошибка"}`)
    } catch (e: any) {
      toast.error(`Ошибка загрузки: ${e?.message || e}`)
    } finally {
      setLoadingModel(false)
    }
  }

  const handleScore = useCallback(async () => {
    if (selected.length < 2) {
      toast.error("Выбери минимум 2 вещи")
      return
    }
    setScoring(true)
    setScoreResult(null)
    try {
      const res = await api.post<ScoreResult>("/api/admin/outfit-scorer/score", {
        item_ids: selected.map((s) => s.id),
      })
      setScoreResult(res)
    } catch (e: any) {
      toast.error(`Оценка не удалась: ${e?.message || e}`)
    } finally {
      setScoring(false)
    }
  }, [selected])

  // Score a preset in-place without disturbing the user's current selection
  const scorePreset = async (idx: number) => {
    setPresets((prev) => prev.map((p, i) => (i === idx ? { ...p, scoring: true, error: undefined, score: null } : p)))
    try {
      const ids = presets[idx].items.map((it) => it.id)
      const res = await api.post<ScoreResult>("/api/admin/outfit-scorer/score", { item_ids: ids })
      setPresets((prev) => prev.map((p, i) => (i === idx ? { ...p, scoring: false, score: res.score } : p)))
    } catch (e: any) {
      setPresets((prev) => prev.map((p, i) =>
        i === idx ? { ...p, scoring: false, error: e?.message || String(e) } : p,
      ))
    }
  }

  const loadPresetIntoSelection = (preset: Preset) => {
    // Preserve source field if present — presets come without explicit source
    // (all from catalog today) but we tag them so future user-item presets
    // don't collide with catalog ids.
    const items: Item[] = preset.items.map((it) => ({ ...it, source: it.source ?? "catalog" }))
    setSelected(items.slice(0, 16))
    setScoreResult(null)
    toast.info(`Загрузили «${preset.title}» в собранный образ`)
  }

  const renderItemCard = (item: Item, picked: boolean, size: "sm" | "md" = "md") => {
    const dim = size === "sm" ? "w-20 h-20" : "w-full aspect-square"
    return (
      <button
        key={`${item.source ?? "catalog"}:${item.id}`}
        onClick={() => toggleItem(item)}
        className={`relative flex flex-col gap-2 p-2 rounded-xl border-2 transition-all text-left ${
          picked ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-gray-400"
        }`}
      >
        <div className={`${dim} overflow-hidden rounded-lg bg-gray-100`}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name ?? ""} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>
        {size === "md" && (
          <>
            <div className="text-xs line-clamp-2">{item.name || "Без названия"}</div>
            <div className="flex gap-1 flex-wrap">
              {item.source && (
                <Badge variant="outline" className="text-[10px] py-0">
                  {item.source === "catalog" ? "каталог" : "юзер"}
                </Badge>
              )}
              {item.clothing_type && (
                <Badge variant="outline" className="text-[10px] py-0">
                  {item.clothing_type}
                </Badge>
              )}
            </div>
          </>
        )}
        {picked && (
          <div className="absolute top-1 right-1 bg-purple-600 text-white rounded-full p-1">
            <Check className="h-3 w-3" />
          </div>
        )}
      </button>
    )
  }

  const band = scoreBand(scoreResult?.score ?? null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OutfitTransformer — тест сочетаемости</h1>
          <p className="text-gray-500 mt-1">
            Собери образ из 2–16 предметов или выбери готовый пресет → модель оценит совместимость от 0 до 1.
          </p>
        </div>

        {/* Model status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Состояние модели
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 flex-wrap">
            {modelStatus?.ready ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                Готова · {modelStatus.device} · {modelStatus.loaded_at}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-600">
                Не загружена (загрузится при первом скоринге)
              </Badge>
            )}
            <Button size="sm" variant="outline" disabled={loadingModel} onClick={handleLoadModel}>
              {loadingModel ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Загрузка…
                </>
              ) : (
                "Загрузить / перепроверить"
              )}
            </Button>
            <span className="text-xs text-gray-500">
              Чекпойнт 1.1 ГБ — качается один раз, потом хранится в volume.
            </span>
          </CardContent>
        </Card>

        {/* Selected outfit — moved ABOVE search so it's always visible */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Собранный образ ({selected.length})</CardTitle>
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => { setSelected([]); setScoreResult(null) }}>
                <X className="h-3 w-3 mr-1" />
                Очистить
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.length === 0 ? (
              <p className="text-sm text-gray-500">
                Пока пусто. Выбери вещи в гриде ниже или возьми готовый пресет.
              </p>
            ) : (
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {selected.map((item) => renderItemCard(item, true))}
              </div>
            )}
            <Button
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl"
              size="lg"
              onClick={handleScore}
              disabled={scoring || selected.length < 2}
            >
              {scoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Оцениваем…
                </>
              ) : (
                `Оценить сочетаемость (${selected.length} вещ${selected.length === 1 ? "ь" : selected.length < 5 ? "и" : "ей"})`
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Current outfit result */}
        {scoreResult && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Результат последней оценки
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {scoreResult.score !== null ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="text-4xl font-bold tabular-nums text-gray-900">
                      {(scoreResult.score * 100).toFixed(1)}%
                    </div>
                    <Badge className={band.className}>{band.label}</Badge>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-400 via-amber-400 to-green-500 transition-all"
                      style={{ width: `${Math.round(scoreResult.score * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    Оценено: {scoreResult.n_items_used} из {scoreResult.requested_ids.length} предметов.
                    {scoreResult.skipped && scoreResult.skipped.length > 0 && (
                      <span className="block mt-1 text-amber-600">
                        <AlertTriangle className="inline h-3 w-3 mr-1" />
                        Не загрузились изображения для id: {scoreResult.skipped.join(", ")}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-amber-700">
                  <AlertTriangle className="inline h-4 w-4 mr-1" />
                  {scoreResult.reason || "Не хватило вещей для оценки (нужно минимум 2)"}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Presets from real DB outfits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <SparklesIcon className="h-4 w-4 text-purple-500" />
              Готовые образы из базы
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPresets ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загружаем примеры…
              </div>
            ) : presets.length === 0 ? (
              <p className="text-sm text-gray-500">В базе пока нет подходящих образов.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {presets.map((preset, idx) => {
                  const b = scoreBand(preset.score)
                  return (
                    <div key={`preset-${idx}`} className="border rounded-xl p-3 space-y-2 bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{preset.title}</div>
                          <div className="text-[11px] text-gray-500 flex gap-2">
                            <span>{preset.items.length} предметов</span>
                            {preset.kind === "synthetic" && <span>· синтетика</span>}
                            {preset.occasion && preset.kind === "real" && <span>· {preset.occasion}</span>}
                          </div>
                        </div>
                        {preset.score !== null && preset.score !== undefined && (
                          <Badge className={b.className}>{(preset.score * 100).toFixed(0)}%</Badge>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {preset.items.slice(0, 6).map((it) => (
                          <div key={it.id} className="w-12 h-12 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                            {it.image_url ? (
                              <img src={it.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        ))}
                        {preset.items.length > 6 && (
                          <div className="w-12 h-12 rounded bg-gray-50 flex items-center justify-center text-[11px] text-gray-500">
                            +{preset.items.length - 6}
                          </div>
                        )}
                      </div>
                      {preset.error && (
                        <div className="text-[11px] text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {preset.error}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          disabled={preset.scoring}
                          onClick={() => scorePreset(idx)}
                        >
                          {preset.scoring ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : preset.score != null ? (
                            "Переоценить"
                          ) : (
                            "Оценить"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => loadPresetIntoSelection(preset)}
                        >
                          Загрузить
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search + filters + picker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Найти и добавить вещи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск по названию…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>

            {/* Type filter chips — multi-select. Shows all clothing_types
                present in the catalog sorted by frequency. Click to toggle. */}
            {typeCounts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">Фильтр по типу</div>
                  {typeFilter.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => setTypeFilter([])}
                    >
                      Сбросить ({typeFilter.length})
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {typeCounts.slice(0, 30).map((tc) => {
                    const active = typeFilter.includes(tc.clothing_type)
                    return (
                      <button
                        key={tc.clothing_type}
                        onClick={() => toggleType(tc.clothing_type)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                          active
                            ? "bg-purple-500 text-white border-purple-500"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {tc.clothing_type}
                        <span className={`ml-1 ${active ? "text-purple-100" : "text-gray-400"}`}>
                          {tc.n}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {catalogItems.length > 0 || userItems.length > 0 ? (
              <div className="space-y-4">
                {catalogItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Каталог ({catalogItems.length}{hasMoreCatalog ? "+" : ""})
                    </h3>
                    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {catalogItems.map((item) =>
                        renderItemCard(
                          item,
                          !!selected.find((s) => s.source === "catalog" && s.id === item.id),
                        ),
                      )}
                    </div>
                    {hasMoreCatalog && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        disabled={loadingMore}
                        onClick={() => loadMore("catalog")}
                      >
                        {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : `Показать ещё ${PAGE_SIZE}`}
                      </Button>
                    )}
                  </div>
                )}
                {userItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Гардероб юзеров ({userItems.length}{hasMoreUser ? "+" : ""})
                    </h3>
                    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {userItems.map((item) =>
                        renderItemCard(item, !!selected.find((s) => s.source === "user" && s.id === item.id)),
                      )}
                    </div>
                    {hasMoreUser && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        disabled={loadingMore}
                        onClick={() => loadMore("user")}
                      >
                        {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : `Показать ещё ${PAGE_SIZE}`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Ничего не найдено под этот запрос и фильтры.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
