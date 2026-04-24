"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, X, Check, AlertTriangle, Zap, Image as ImageIcon } from "lucide-react"
import { api } from "@/lib/api-client"
import { toast } from "sonner"

type Item = {
  id: number
  name: string | null
  image_url: string | null
  clothing_type: string | null
  color: string | null
  source: "catalog" | "user"
}

type ScoreResult = {
  requested_ids: number[]
  resolved_count: number
  score: number | null
  n_items_used: number
  skipped?: number[]
  reason?: string
}

function scoreBand(score: number | null): { label: string; className: string } {
  if (score === null) return { label: "—", className: "bg-gray-100 text-gray-600" }
  if (score >= 0.8) return { label: "Отличная сочетаемость", className: "bg-green-100 text-green-800" }
  if (score >= 0.65) return { label: "Хорошая", className: "bg-emerald-100 text-emerald-800" }
  if (score >= 0.5) return { label: "Средняя", className: "bg-amber-100 text-amber-800" }
  if (score >= 0.35) return { label: "Слабая", className: "bg-orange-100 text-orange-800" }
  return { label: "Плохая сочетаемость", className: "bg-red-100 text-red-800" }
}

export default function OutfitScoringAdminPage() {
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ catalog: Item[]; user: Item[] }>({ catalog: [], user: [] })
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Item[]>([])
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [scoring, setScoring] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [modelStatus, setModelStatus] = useState<{ ready: boolean; loaded_at?: string; device?: string; error?: string } | null>(null)

  // Search as user types (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 2) {
        setSearchResults({ catalog: [], user: [] })
        return
      }
      setSearching(true)
      try {
        const res = await api.get<{ catalog: Item[]; user: Item[] }>(
          `/api/admin/outfit-scorer/search-items?q=${encodeURIComponent(query)}&limit=20`,
        )
        setSearchResults(res)
      } catch (e: any) {
        toast.error(`Поиск не удался: ${e?.message || e}`)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const toggleItem = (item: Item) => {
    setSelected((prev) => {
      const key = `${item.source}:${item.id}`
      const exists = prev.find((p) => `${p.source}:${p.id}` === key)
      if (exists) return prev.filter((p) => `${p.source}:${p.id}` !== key)
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
        "/api/admin/outfit-scorer/load",
        {},
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

  const renderItemCard = (item: Item, picked: boolean) => (
    <button
      key={`${item.source}:${item.id}`}
      onClick={() => toggleItem(item)}
      className={`relative flex flex-col gap-2 p-2 rounded-xl border-2 transition-all text-left ${
        picked ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-gray-400"
      }`}
    >
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name ?? ""} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="text-xs line-clamp-2">{item.name || "Без названия"}</div>
      <div className="flex gap-1 flex-wrap">
        <Badge variant="outline" className="text-[10px] py-0">
          {item.source === "catalog" ? "каталог" : "юзер"}
        </Badge>
        {item.clothing_type && (
          <Badge variant="outline" className="text-[10px] py-0">
            {item.clothing_type}
          </Badge>
        )}
      </div>
      {picked && (
        <div className="absolute top-1 right-1 bg-purple-600 text-white rounded-full p-1">
          <Check className="h-3 w-3" />
        </div>
      )}
    </button>
  )

  const band = scoreBand(scoreResult?.score ?? null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OutfitTransformer — тест сочетаемости</h1>
          <p className="text-gray-500 mt-1">
            Собери образ из 2–16 предметов каталога или пользовательских вещей → модель оценит совместимость от 0 до 1.
            Score ≥ 0.5 — это пороговое значение, ниже которого образ вероятно плохой.
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
          <CardContent className="flex items-center gap-3">
            {modelStatus?.ready ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                Готова · {modelStatus.device} · {modelStatus.loaded_at}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-600">
                Не загружена
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
              Первая загрузка качает 1.1 ГБ чекпойнт, потом хранится в volume.
            </span>
          </CardContent>
        </Card>

        {/* Search */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Найти вещи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск по названию (минимум 2 символа)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>

            {(searchResults.catalog.length > 0 || searchResults.user.length > 0) && (
              <div className="space-y-4">
                {searchResults.catalog.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Каталог ({searchResults.catalog.length})
                    </h3>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {searchResults.catalog.map((item) =>
                        renderItemCard(
                          item,
                          !!selected.find((s) => s.source === "catalog" && s.id === item.id),
                        ),
                      )}
                    </div>
                  </div>
                )}
                {searchResults.user.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Гардероб юзеров ({searchResults.user.length})
                    </h3>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {searchResults.user.map((item) =>
                        renderItemCard(item, !!selected.find((s) => s.source === "user" && s.id === item.id)),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected outfit */}
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
              <p className="text-sm text-gray-500">Выбери вещи через поиск выше.</p>
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

        {/* Result */}
        {scoreResult && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Результат
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
      </div>
    </div>
  )
}
