"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface HomeHeroSectionProps {
  userItemsCount: number
  onAddItems: () => void
  onExploreFeatures?: () => void
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ru-RU", { weekday: "short" })

interface DayCell {
  key: string
  weekday: string
  day: number
  isToday: boolean
}

// Today-centered rolling window — always keeps "today" visible regardless
// of where in the calendar week we currently are (unlike a fixed Mon–Sun strip).
function buildDayStrip(): DayCell[] {
  const today = new Date()
  const cells: DayCell[] = []
  for (let offset = -3; offset <= 3; offset++) {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    cells.push({
      key: date.toISOString().slice(0, 10),
      weekday: WEEKDAY_FORMATTER.format(date).replace(".", ""),
      day: date.getDate(),
      isToday: offset === 0,
    })
  }
  return cells
}

const OUTFIT_SLOTS = [
  { key: "top", label: "Верх" },
  { key: "bottom", label: "Низ" },
  { key: "shoes", label: "Обувь" },
]

export function HomeHeroSection({
  userItemsCount,
  onAddItems,
  onExploreFeatures,
}: HomeHeroSectionProps) {
  const days = buildDayStrip()

  return (
    <div className="flex flex-1 flex-col">
      {/* День-стрип — единственный сигнальный акцент на экране (today) */}
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        {days.map((d) => (
          <div key={d.key} className="flex flex-col items-center gap-1.5">
            <span className="text-micro uppercase text-ink-3">{d.weekday}</span>
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-caption font-semibold",
                d.isToday ? "bg-signal text-signal-ink" : "text-ink-2"
              )}
            >
              {d.day}
            </span>
          </div>
        ))}
      </div>

      <h1
        className="text-h1 text-ink animate-fade-up"
        style={{ animationDelay: "50ms" }}
      >
        Сегодня
      </h1>
      <p
        className="text-body text-ink-2 mt-1 mb-4 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        Добавь вещи — здесь появится готовый образ
      </p>

      {/* Пустые слоты образа — прямо на холсте, без коробки в коробке.
          Контраст держит контур (border-ink-3), а не заливка: три оттенка
          серого в 3% светлоты друг от друга были почти неразличимы. */}
      <div className="grid grid-cols-1 gap-2.5 animate-fade-up" style={{ animationDelay: "150ms" }}>
        {OUTFIT_SLOTS.map((slot) => (
          <button
            key={slot.key}
            type="button"
            onClick={onAddItems}
            className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-ink-3 transition-transform duration-press ease-out active:scale-[.98]"
          >
            <Plus className="h-5 w-5 text-ink-2" />
            <span className="text-micro uppercase text-ink-2">{slot.label}</span>
          </button>
        ))}
      </div>

      {/* Пауза — намеренный воздух между слотами и кнопкой, а не мёртвый
          холст после неё. */}
      <div className="flex-1" />

      <Button
        onClick={onAddItems}
        variant="default"
        size="lg"
        className="w-full animate-fade-up"
        style={{ animationDelay: "200ms" }}
      >
        <Plus className="w-4 h-4" />
        Добавить вещь
      </Button>

      {/* Резерв под плавающий таб-бар — кнопка не должна прятаться за ним */}
      <div className="h-24" />
    </div>
  )
}
