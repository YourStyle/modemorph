// Вещь образа и сам образ в том виде, в каком их отдаёт бэкенд рекомендаций
// (/api/recommendations, ai-assistant). Одно определение на главную, карточку
// образа и примерку — раньше их было три, и они разъехались.

export interface OutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  /** Магазин из notes ("ЦУМ", "SELA"). До 2026-08-20 он приезжал в поле brand,
   *  и пальто Saint Laurent подписывалось «ЦУМ» — 62% каталога это ЦУМ. */
  retailer?: string
  /** Марка вещи (wardrobe_items.brand). Пусто, пока бренд неизвестен: лучше
   *  ничего, чем чужая марка на карточке. */
  brand?: string
  /** Откуда взялась марка (wardrobe_items.brand_source):
   *  feed_vendor — <vendor> из фида магазина, monobrand — константа
   *  монобрендового магазина, dictionary — ВЫВЕДЕНА из названия товара.
   *  Последняя категория (3269 позиций каталога по плану бэкфилла на
   *  2026-08-20; из них 3239 — ЦУМ) не должна выглядеть так же уверенно, как
   *  11620 позиций, которые назвал сам мерчант. Граница между ними ездит вместе
   *  с фидом: товар ушёл из продажи — строка переехала из feed_vendor в
   *  dictionary, вечером того же дня по ЦУМу уже 11494 / 3356. */
  brand_source?: string | null
  size_type?: string
  /** Канонический слаг типа одежды. Нужен, чтобы отличить аксессуар в образе. */
  clothing_type?: string | null
  has_print?: string
  has_details?: string
  notes?: string
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
  item_source?: "user" | "catalog"
  source?: "wardrobe_items" | "wardrobe_user_items"
  /** Цена из каталога (витрина недостающих вещей). */
  price?: number | null
}

export interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}
