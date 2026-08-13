// lib/labels.ts — shared Russian labels for English enum values

import { normalizeClothingType } from "./clothing-types"

export const STYLE_LABELS: Record<string, string> = {
  casual: "Повседневный",
  formal: "Формальный",
  business: "Деловой",
  sport: "Спортивный",
  streetwear: "Уличный",
  bohemian: "Бохо",
  minimalist: "Минимализм",
  classic: "Классика",
  romantic: "Романтичный",
  grunge: "Гранж",
  preppy: "Преппи",
  vintage: "Винтаж",
}

export const CLOTHING_TYPE_LABELS: Record<string, string> = {
  "t-shirt": "Футболка",
  shirt: "Рубашка",
  blouse: "Блузка",
  "tank-top": "Топ",
  longsleeve: "Лонгслив",
  turtleneck: "Водолазка",
  pullover: "Свитер",
  cardigan: "Кардиган",
  hoodie: "Худи",
  sweatshirt: "Свитшот",
  vest: "Жилет",
  "suit-jacket": "Пиджак",
  coat: "Пальто",
  jacket: "Куртка",
  // Было "Куртка" — подпись врала: puffer-jacket это пуховик, и после появления
  // слага jacket две категории показывались пользователю одним словом.
  "puffer-jacket": "Пуховик",
  parka: "Парка",
  classic: "Костюм",
  dress: "Платье",
  skirt: "Юбка",
  jumpsuit: "Комбинезон",
  pants: "Брюки",
  jeans: "Джинсы",
  "sporty-pants": "Спортивные брюки",
  shorts: "Шорты",
  "fur-coat": "Шуба",
  "sheepskin-coat": "Дубленка",
  "knitted-suit": "Вязаный костюм",
  tracksuit: "Спортивный костюм",
  shoes: "Туфли",
  boots: "Ботинки",
  sneakers: "Кроссовки",
  sandals: "Босоножки",
}

export function styleLabel(key: string): string {
  return STYLE_LABELS[key] || key
}

export function clothingTypeLabel(key: string): string {
  const canonical = normalizeClothingType(key)
  return (canonical && CLOTHING_TYPE_LABELS[canonical]) || CLOTHING_TYPE_LABELS[key] || key
}
