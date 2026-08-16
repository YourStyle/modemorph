"use client"

import Image from "next/image"

/**
 * Витрина «чего не хватает в гардеробе».
 *
 * Это НЕ образ. Внутри каждой группы лежат взаимозаменяемые варианты ОДНОГО
 * слота — четыре разных свитера, из которых надо выбрать один. Рендерить их
 * карточкой образа с кнопками «Весь образ» и «Примерить» значит обещать то,
 * чего нет: примерить сразу четыре свитера нельзя.
 *
 * Поэтому отдельный компонент, а не флаг внутри outfit-card.tsx — иначе
 * изменения в одном начнут ломать другое.
 */

export interface GapItem {
  id: string | number
  name?: string
  image_url?: string | null
  url?: string | null
  brand?: string | null
  price?: number | null
}

export interface GapGroup {
  id: string
  title: string
  items: GapItem[]
}

function formatPrice(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`
}

function GapCard({ item }: { item: GapItem }) {
  const body = (
    <>
      {/* aspect-square, как в outfit-card.tsx: каталожные фото — квадратные
          флэтлеи, на 3:4 они обрезались бы сверху и снизу. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-canvas-sunk">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name ?? ""}
            fill
            sizes="144px"
            className="object-cover"
          />
        ) : null}
      </div>
      {item.name ? (
        <p className="mt-2 line-clamp-2 text-caption text-ink">{item.name}</p>
      ) : null}
      {item.brand ? <p className="text-caption text-ink-2">{item.brand}</p> : null}
      {typeof item.price === "number" ? (
        <p className="text-caption font-semibold text-ink">{formatPrice(item.price)}</p>
      ) : null}
    </>
  )

  // Без url ссылка вела бы в никуда — показываем ту же карточку, но некликабельной.
  if (!item.url) {
    return <div className="w-36 flex-shrink-0 snap-start">{body}</div>
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-36 flex-shrink-0 snap-start"
    >
      {body}
    </a>
  )
}

export function GapShelf({ groups }: { groups: GapGroup[] }) {
  if (!groups.length) return null

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        if (!group.items?.length) return null
        return (
          <div key={group.id} className="space-y-2">
            <h3 className="px-4 text-body font-semibold text-ink">{group.title}</h3>
            <div className="relative scroll-section -mx-4">
              <div className="flex snap-x gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 pt-1">
                {group.items.map((item) => (
                  <GapCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
