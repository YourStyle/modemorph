"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Search, MapPin, Loader2 } from "lucide-react"

interface CityResult {
  name: string
  country: string
  state?: string
  lat: number
  lon: number
}

interface CityPickerProps {
  /** Called with the fresh weather payload after a city is chosen. */
  onPicked: (weather: any) => void
  autoFocus?: boolean
}

/**
 * Инлайновый выбор города: строка поиска + список результатов. Раньше жил
 * внутри CityPickerSheet как отдельная шторка поверх шторки профиля — тап
 * мимо погоды в пилюле открывал профиль, тап по погоде открывал вторую
 * шторку прямо над первой. Теперь это переиспользуемый блок без своего
 * CommonSheet: встраивается прямо в UserProfileSheet раскрывающейся секцией,
 * второго слоя модалок больше нет.
 */
export function CityPicker({ onPicked, autoFocus = true }: CityPickerProps) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<CityResult[]>([])
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState(false)

  // Debounced city search via the geocoding endpoint.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const d = await api.get(`/api/weather/search-city?q=${encodeURIComponent(term)}`)
        if (!cancelled) setResults(d?.results || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  const pick = async (c: CityResult) => {
    setApplying(true)
    try {
      // Fetching weather for these coords also caches them as the user's location.
      const w = await api.get(`/api/weather?lat=${c.lat}&lon=${c.lon}`)
      onPicked(w)
      setQ("")
      setResults([])
    } catch {
      // ignore
    } finally {
      setApplying(false)
    }
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Начни вводить город…"
          aria-label="Поиск города"
          className="w-full h-11 pl-10 pr-3 rounded-full bg-canvas border border-line outline-none text-ink placeholder:text-ink-3"
        />
      </div>

      {searching && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-5 w-5 animate-spin text-signal" strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}

      <ul className="space-y-1 max-h-[40vh] overflow-auto">
        {results.map((c, i) => (
          <li key={`${c.lat},${c.lon},${i}`}>
            <button
              type="button"
              disabled={applying}
              onClick={() => pick(c)}
              className="w-full min-h-11 flex items-center gap-3 p-3 rounded-2xl hover:bg-canvas text-left disabled:opacity-50 transition-colors"
            >
              <MapPin className="h-4 w-4 text-ink-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="text-body text-ink">
                {c.name}
                <span className="text-ink-2 text-caption">
                  {c.state ? `, ${c.state}` : ""}
                  {c.country ? `, ${c.country}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
        {!searching && q.trim().length >= 2 && results.length === 0 && (
          <li className="text-center text-caption text-ink-2 py-4">Ничего не найдено</li>
        )}
      </ul>
    </div>
  )
}
