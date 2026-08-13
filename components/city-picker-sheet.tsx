"use client"

import { useEffect, useState } from "react"
import { CommonSheet } from "@/components/common-sheet"
import { api } from "@/lib/api-client"
import { Search, MapPin, Loader2 } from "lucide-react"

interface CityResult {
  name: string
  country: string
  state?: string
  lat: number
  lon: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Called with the fresh weather payload after a city is chosen. */
  onPicked: (weather: any) => void
  currentCity?: string
  currentCountry?: string
}

export function CityPickerSheet({ isOpen, onClose, onPicked, currentCity, currentCountry }: Props) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<CityResult[]>([])
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState(false)

  // Debounced city search via the geocoding endpoint.
  useEffect(() => {
    if (!isOpen) return
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
  }, [q, isOpen])

  const pick = async (c: CityResult) => {
    setApplying(true)
    try {
      // Fetching weather for these coords also caches them as the user's location.
      const w = await api.get(`/api/weather?lat=${c.lat}&lon=${c.lon}`)
      onPicked(w)
      setQ("")
      setResults([])
      onClose()
    } catch {
      // ignore
    } finally {
      setApplying(false)
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} backgroundColor="white">
      <div className="pb-4">
        <h2 className="text-h2 text-center text-ink mb-1">Выбор города</h2>
        <p className="text-caption text-ink-2 text-center mb-4">
          {currentCity
            ? `Сейчас: ${currentCity}${currentCountry ? `, ${currentCountry}` : ""}`
            : "Укажи свой город для точной погоды"}
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" strokeWidth={1.75} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Начни вводить город…"
            className="w-full h-12 pl-10 pr-3 rounded-full bg-canvas-sunk outline-none text-ink placeholder:text-ink-3"
          />
        </div>

        {searching && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-signal" strokeWidth={1.75} />
          </div>
        )}

        <ul className="space-y-1 max-h-[45vh] overflow-auto">
          {results.map((c, i) => (
            <li key={`${c.lat},${c.lon},${i}`}>
              <button
                disabled={applying}
                onClick={() => pick(c)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-canvas-sunk text-left disabled:opacity-50 transition-colors"
              >
                <MapPin className="h-4 w-4 text-ink-3 shrink-0" strokeWidth={1.75} />
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
    </CommonSheet>
  )
}
