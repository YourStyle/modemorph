// Словарь переводов типов одежды.
// Канонический слаг-словарь. Питон-зеркало: backend/clothing_taxonomy.py и
// ai-service/clip/clothing_taxonomy.py — те же слаги, те же алиасы.
export const clothingTypes = {
  // Верхняя одежда (легкая)
  blouse: "Блузка",
  longsleeve: "Лонгслив",
  shirt: "Рубашка",
  "t-shirt": "Футболка",
  "tank-top": "Майка",

  // Верхняя одежда (теплая)
  cardigan: "Кардиган",
  hoodie: "Худи",
  pullover: "Пуловер",
  "suit-jacket": "Пиджак",
  sweatshirt: "Свитшот",
  turtleneck: "Водолазка",
  vest: "Жилет",

  // Платья и юбки
  dress: "Платье",
  skirt: "Юбка",
  jumpsuit: "Комбинезон",

  // Брюки и джинсы
  jeans: "Джинсы",
  pants: "Брюки",
  shorts: "Шорты",
  "sporty-pants": "Спортивные брюки",

  // Комплекты
  classic: "Классический костюм",
  "knitted-suit": "Вязаный костюм",
  tracksuit: "Спортивный костюм",

  // Верхняя одежда (зимняя)
  coat: "Пальто",
  jacket: "Куртка",
  "fur-coat": "Шуба",
  parka: "Парка",
  "puffer-jacket": "Пуховик",
  "sheepskin-coat": "Дубленка",

  // Обувь
  shoes: "Туфли",
  boots: "Ботинки",
  sneakers: "Кроссовки",
  sandals: "Босоножки",
} as const

// Старые значения, которые всё ещё лежат в БД (wardrobe_items: lonsleeve 346
// строк, wardrobe_user_items: 18, basic_wardrobe_items: 2 — замер 13.08.2026).
// Читающий код обязан их резолвить, иначе вещь теряет слот и пропадает из образов.
export const CLOTHING_TYPE_ALIASES: Record<string, string> = {
  lonsleeve: "longsleeve",
  hoddie: "hoodie",
  "fur-coat-dark-brown": "fur-coat",
  обувь: "shoes",
  // Написания слага jacket/jumpsuit. Зеркало TYPE_ALIASES в
  // backend/clothing_taxonomy.py — держать синхронно.
  windbreaker: "jacket",
  bomber: "jacket",
  "bomber-jacket": "jacket",
  "denim-jacket": "jacket",
  romper: "jumpsuit",
  overall: "jumpsuit",
  overalls: "jumpsuit",
}

// Значения, означающие «тип не проставлен», а НЕ тип одежды: 'верхняя' — это
// DEFAULT колонки (backend/migrations/001_schema.sql), 'аксессуар' — категория
// без слота. Ни то, ни другое нельзя превращать в слаг.
const CLOTHING_TYPE_UNSET = new Set([
  "",
  "верхняя",
  "нижняя",
  "аксессуар",
  "часы",
  "головной убор",
  "спорт",
  "nan",
  "null",
  "none",
  "-",
])

/** Канонический слаг или null, если значение не несёт типа. */
export function normalizeClothingType(type?: string | null): string | null {
  const v = (type || "").trim().toLowerCase()
  if (!v || CLOTHING_TYPE_UNSET.has(v)) return null
  if (v in clothingTypes) return v
  return CLOTHING_TYPE_ALIASES[v] ?? null
}

// Категории одежды для группировки
export const clothingCategories = {
  "light-upper": {
    name: "Легкая верхняя одежда",
    types: ["blouse", "longsleeve", "shirt", "t-shirt", "tank-top"],
  },
  "warm-upper": {
    name: "Теплая верхняя одежда",
    types: ["cardigan", "hoodie", "pullover", "suit-jacket", "sweatshirt", "turtleneck", "vest"],
  },
  "dresses-skirts": {
    name: "Платья и юбки",
    types: ["dress", "skirt", "jumpsuit"],
  },
  pants: {
    name: "Брюки и джинсы",
    types: ["jeans", "pants", "shorts", "sporty-pants"],
  },
  sets: {
    name: "Комплекты",
    types: ["classic", "knitted-suit", "tracksuit"],
  },
  outerwear: {
    name: "Верхняя одежда",
    types: ["jacket", "coat", "fur-coat", "parka", "puffer-jacket", "sheepskin-coat"],
  },
  // Обуви здесь не было вообще, хотя бэкенд (_SLOT_MAP) слот shoes знает, и в
  // БД 930 таких вещей в каталоге + 105 у пользователей. Из-за пропуска
  // dedupeByCategorySlot() в lib/recommendation-filters.ts пропускала обувь мимо
  // слотов, и в образ могли попасть две пары обуви сразу.
  shoes: {
    name: "Обувь",
    types: ["shoes", "boots", "sneakers", "sandals"],
  },
} as const

// Функция для получения перевода типа одежды
export function getClothingTypeName(type: string): string {
  const canonical = normalizeClothingType(type)
  if (!canonical) return type
  return clothingTypes[canonical as keyof typeof clothingTypes] || type
}

// Функция для получения ��сех типов одежды
export function getAllClothingTypes(): Array<{ value: string; label: string }> {
  return Object.entries(clothingTypes).map(([value, label]) => ({
    value,
    label,
  }))
}

// Функция для получения типов по категориям
export function getClothingTypesByCategory() {
  return Object.entries(clothingCategories).map(([key, category]) => ({
    categoryKey: key,
    categoryName: category.name,
    types: category.types.map((type) => ({
      value: type,
      label: getClothingTypeName(type),
    })),
  }))
}
