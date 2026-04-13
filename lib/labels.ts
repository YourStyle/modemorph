// lib/labels.ts — shared Russian labels for English enum values

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
  lonsleeve: "Лонгслив",
  turtleneck: "Водолазка",
  pullover: "Свитер",
  cardigan: "Кардиган",
  hoodie: "Худи",
  sweatshirt: "Свитшот",
  vest: "Жилет",
  "suit-jacket": "Пиджак",
  coat: "Пальто",
  "puffer-jacket": "Куртка",
  parka: "Парка",
  classic: "Костюм",
  dress: "Платье",
  skirt: "Юбка",
  pants: "Брюки",
  jeans: "Джинсы",
  "sporty-pants": "Спортивные брюки",
  shorts: "Шорты",
}

export function styleLabel(key: string): string {
  return STYLE_LABELS[key] || key
}

export function clothingTypeLabel(key: string): string {
  return CLOTHING_TYPE_LABELS[key] || key
}
