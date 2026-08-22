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
  /** Магазин, где вещь продаётся (ЦУМ, SELA). Приходит из notes. */
  retailer?: string | null
  /** Марка вещи (Saint Laurent). До 2026-08-20 сюда приезжал магазин, поэтому
   *  пальто Saint Laurent подписывалось «ЦУМ». Теперь это колонка
   *  wardrobe_items.brand и она пустая, пока бренд неизвестен. */
  brand?: string | null
  /** Откуда взялась марка: feed_vendor / monobrand — её назвал мерчант,
   *  dictionary — она выведена из названия товара. */
  brand_source?: string | null
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

// Литералы источника фида из notes: это магазины, а не марки. Ни один из них не
// имеет права попасть в строку марки — «ЦУМ» под пальто Saint Laurent был
// ровно этим.
const NOT_A_BRAND = new Set(["цум", "elyts", "unknown", "https", "http"])

// Знак «это наша догадка, а не слова магазина» — тот же, что в outfit-card.tsx.
// Он именно ВИДИМЫЙ и живёт в тексте: витрина открывается в Telegram на тач-
// экране, где `title` не срабатывает никогда, а оттенок серого (text-ink-3
// против text-ink-2) как единственный носитель смысла не читается вообще —
// пользователь видел просто марку. Знак переживает truncate: обрезается хвост
// названия, префикс остаётся. Пояснение уезжает в title/aria-label — на
// десктопе и в скринридере оно доступно, на телефоне работает сам знак.
const INFERRED_BRAND_MARK = "≈"
const INFERRED_BRAND_HINT = "Марку мы определили по названию товара — магазин её не указывал"

function GapCard({ item }: { item: GapItem }) {
  const rawBrand = item.brand?.trim()
  const brand = rawBrand && !NOT_A_BRAND.has(rawBrand.toLowerCase()) ? rawBrand : null
  const brandInferred = item.brand_source === "dictionary"
  const rawRetailer = item.retailer?.trim()
  const retailer =
    rawRetailer && rawRetailer.toLowerCase() !== "unknown" && !rawRetailer.toLowerCase().startsWith("http")
      ? rawRetailer
      : null

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
      {/* Марка. Без отката на магазин: до 2026-08-20 в этой строке всегда стоял
          магазин под видом марки, и 62% витрины подписывалось «ЦУМ». Марка,
          выведенная из названия (brand_source='dictionary'), помечается знаком
          «≈» — это догадка матчера, а не слова мерчанта.
          truncate: карточка шириной 144px, а марки бывают длинные («Philosophy
          di Lorenzo Serafini») — раньше тут стоял короткий «ЦУМ». */}
      {brand ? (
        <p
          className={`truncate text-caption ${brandInferred ? "text-ink-3" : "text-ink-2"}`}
          title={brandInferred ? INFERRED_BRAND_HINT : brand}
          aria-label={brandInferred ? `${brand} — ${INFERRED_BRAND_HINT}` : undefined}
        >
          {brandInferred ? `${INFERRED_BRAND_MARK} ${brand}` : brand}
        </p>
      ) : null}
      {/* Это витрина покупок, поэтому магазин здесь полезен — но как отдельная
          строка рядом с ценой, а не как подпись марки. */}
      {typeof item.price === "number" || retailer ? (
        <div className="flex items-baseline gap-1.5">
          {typeof item.price === "number" ? (
            <p className="text-caption font-semibold text-ink">{formatPrice(item.price)}</p>
          ) : null}
          {retailer ? <p className="truncate text-caption text-ink-3">в {retailer}</p> : null}
        </div>
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
