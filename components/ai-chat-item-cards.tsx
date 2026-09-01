"use client"

import { ExternalLink } from "lucide-react"

/**
 * Сетка карточек вещей под ответом ассистента.
 *
 * Раньше эта разметка жила внутри ветки "образ" на странице чата, поэтому
 * карточки видел только тот, кому модель собрала лук. На разборе гардероба или
 * ответе "что докупить" вещи оставались текстом — а модель ещё и печатала в нём
 * внутренние id ("серые леггинсы (ID: 1590)"). Вынесено сюда, чтобы обычный
 * ответ показывал те же карточки, что и образ: ничего нового не рисуем,
 * переиспользуем то, что уже было.
 */

export interface RecommendationItem {
  type: "clothing"
  id: number
  name: string
  image_url: string
  color: string
  url?: string | null
  /** false — вещь из партнёрского каталога, а не из гардероба пользователя. */
  isUserItem: boolean
}

export function AiChatItemCards({ items }: { items: RecommendationItem[] }) {
  if (!items.length) return null

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.id} className="text-left">
          <div className="relative mb-1 aspect-square overflow-hidden rounded-xl bg-canvas">
            <img
              src={item.image_url || "/placeholder.svg"}
              alt={item.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = "/placeholder.svg?height=150&width=150"
              }}
            />
            {/* Покупки из каталога: вещь не из гардероба пользователя —
                подписываем и (если есть) даём партнёрскую ссылку. */}
            {!item.isUserItem && (
              <span className="absolute left-1 top-1 rounded-md bg-ink/85 px-1.5 py-0.5 text-[10px] font-medium text-signal-ink">
                Купить
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-ink-2">{item.name}</p>
          {!item.isUserItem && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-signal"
            >
              <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} />В магазин
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

/** Сырой элемент из ответа модели — id приходит строкой, user_id есть только у своих вещей. */
export interface ApiRecommendationItem {
  id: string | number
  name: string
  user_id?: string | null
  image_url?: string | null
  color?: string | null
  url?: string | null
}

/** Одна точка нормализации ответа модели: и для образа, и для обычного ответа. */
export function toRecommendationItems(raw: ApiRecommendationItem[] | undefined): RecommendationItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      type: "clothing" as const,
      id: Number(item.id),
      name: item.name,
      image_url: item.image_url || "",
      color: item.color || "unknown",
      url: item.url || null,
      isUserItem: !!item.user_id,
    }))
    // Модель иногда выдумывает id: без картинки карточка — серый прямоугольник,
    // такой мусор в ответе хуже, чем его отсутствие.
    .filter((item) => Number.isFinite(item.id) && !!item.name)
}
