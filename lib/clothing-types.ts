// Словарь переводов типов одежды
export const clothingTypes = {
  // Верхняя одежда (легкая)
  blouse: "Блузка",
  lonsleeve: "Лонгслив",
  shirt: "Рубашка",
  "t-shirt": "Футболка",
  "tank-top": "Майка",

  // Верхняя одежда (теплая)
  cardigan: "Кардиган",
  hoodie: "Худи",
  hoddie: "Худи", // дубликат
  pullover: "Пуловер",
  "suit-jacket": "Пиджак",
  sweatshirt: "Свитшот",
  turtleneck: "Водолазка",
  vest: "Жилет",

  // Платья и юбки
  dress: "Платье",
  skirt: "Юбка",

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
  "fur-coat": "Шуба",
  "fur-coat-dark-brown": "Шуба темно-коричневая",
  parka: "Парка",
  "puffer-jacket": "Пуховик",
  "sheepskin-coat": "Дубленка",
} as const

// Категории одежды для группировки
export const clothingCategories = {
  "light-upper": {
    name: "Легкая верхняя одежда",
    types: ["blouse", "lonsleeve", "shirt", "t-shirt", "tank-top"],
  },
  "warm-upper": {
    name: "Теплая верхняя одежда",
    types: ["cardigan", "hoodie", "hoddie", "pullover", "suit-jacket", "sweatshirt", "turtleneck", "vest"],
  },
  "dresses-skirts": {
    name: "Платья и юбки",
    types: ["dress", "skirt"],
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
    types: ["coat", "fur-coat", "fur-coat-dark-brown", "parka", "puffer-jacket", "sheepskin-coat"],
  },
} as const

// Функция для получения перевода типа одежды
export function getClothingTypeName(type: string): string {
  return clothingTypes[type as keyof typeof clothingTypes] || type
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
