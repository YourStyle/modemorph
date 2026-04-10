// lib/feed-parser.ts
// TypeScript port of category mapping and YML parsing from ai-service/scripts/import_catalog.py

import { XMLParser } from "fast-xml-parser"

// ---------------------------------------------------------------------------
// Category mapping: YML category names → our clothing_type
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, string> = {
  // Верхняя одежда
  "верхняя одежда": "coat",
  "базовые куртки": "puffer-jacket",
  "куртки": "puffer-jacket",
  "пальто и полупальто": "coat",
  "пальто": "coat",
  "тренчи и плащи": "coat",
  "бомберы": "coat",
  "ветровки": "coat",
  "дубленки и шубы": "sheepskin-coat",
  "джинсовые куртки": "coat",
  "жилеты": "vest",
  "кожа и замша": "coat",
  // Джемперы / кардиганы
  "джемперы и кардиганы": "pullover",
  "джемперы и свитеры": "pullover",
  "кардиганы": "cardigan",
  "водолазки": "turtleneck",
  "поло": "t-shirt",
  // Футболки
  "футболки и лонгсливы": "t-shirt",
  "лонгсливы": "lonsleeve",
  "культовые": "t-shirt",
  "базовые": "t-shirt",
  "принт и вышивка": "t-shirt",
  // Худи
  "худи и свитшоты": "hoodie",
  "худи": "hoodie",
  "свитшоты": "sweatshirt",
  "на молнии": "hoodie",
  // Рубашки / блузки
  "рубашки и блузки": "shirt",
  "рубашки": "shirt",
  "блузки": "blouse",
  // Брюки
  "брюки и леггинсы": "pants",
  "брюки": "pants",
  "классические": "pants",
  "широкие": "pants",
  "карго и парашюты": "sporty-pants",
  "джоггеры": "sporty-pants",
  "леггинсы": "pants",
  // Джинсы
  "джинсы": "jeans",
  "слим": "jeans",
  "прямые": "jeans",
  "мом": "jeans",
  "клеш": "jeans",
  // Платья
  "платья": "dress",
  "летние": "dress",
  "макси и миди": "dress",
  "мини": "dress",
  "вечерние": "dress",
  "трикотажные": "dress",
  // Юбки
  "юбки": "skirt",
  // Шорты
  "шорты": "pants",
  // Жакеты
  "жакеты и жилеты": "suit-jacket",
  "жакеты": "suit-jacket",
  // Комплекты
  "комплекты": "classic",
  // Спорт
  "спортивная одежда": "sporty-pants",
  // Топы
  "топы и боди": "tank-top",
  "кроп-топы": "tank-top",
  "боди": "tank-top",
  // Комбинезоны
  "комбинезоны": "dress",
}

const SKIP_CATEGORIES = new Set([
  "носки", "колготки", "гетры",
  "нижнее белье", "бюстгальтеры", "трусы",
  "домашняя одежда", "пижамы", "халаты", "сорочки",
  "купальники и пляжная одежда", "купальные лифы", "купальные трусы",
  "постельное белье", "полотенца", "пледы",
  "кружки", "канцелярия", "брелоки",
  "наборы",
  "аксессуары для сна",
])

const FEMALE_CATS = new Set(["1", "1374"])
const MALE_CATS = new Set(["2", "1443"])

const COLORS_RU: Record<string, string> = {
  "черн": "Черный", "бел": "Белый", "сер": "Серый", "син": "Синий",
  "голуб": "Голубой", "красн": "Красный", "розов": "Розовый",
  "зелен": "Зеленый", "бежев": "Бежевый", "коричнев": "Коричневый",
  "хаки": "Хаки", "бордов": "Бордовый", "фиолетов": "Фиолетовый",
  "оранж": "Оранжевый", "желт": "Желтый",
}

function mapClothingType(categoryName: string, parentName: string = ""): string | null {
  const nameLower = categoryName.toLowerCase().trim()
  if (SKIP_CATEGORIES.has(nameLower)) return null

  // Direct match
  if (CATEGORY_MAP[nameLower]) return CATEGORY_MAP[nameLower]

  // Try parent
  const parentLower = parentName.toLowerCase().trim()
  if (parentLower && CATEGORY_MAP[parentLower]) return CATEGORY_MAP[parentLower]

  // Fuzzy match
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (nameLower.includes(key)) return val
  }

  return null
}

function extractColor(name: string): string {
  const nameLower = name.toLowerCase()
  for (const [key, color] of Object.entries(COLORS_RU)) {
    if (nameLower.includes(key)) return color
  }
  return ""
}

export interface ParsedFeedItem {
  item_name: string
  description: string
  image_url: string
  url: string
  clothing_type: string
  color: string
  gender: string | null
  source: string
  source_sku: string
  price: number | null
}

export interface ParseFeedResult {
  items: ParsedFeedItem[]
  shopName: string
  totalOffers: number
  skippedCategories: number
  skippedNoImage: number
}

/** Parse a YML (Yandex Market Language) XML string and extract clothing items */
export function parseYmlFeed(xmlString: string): ParseFeedResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "offer" || name === "category" || name === "picture",
  })

  const doc = parser.parse(xmlString)
  const shop = doc?.yml_catalog?.shop
  if (!shop) {
    throw new Error("Неверный формат фида: не найден элемент yml_catalog/shop")
  }

  const shopName = shop.name || "Unknown"

  // Build category lookup
  const catMap: Record<string, string> = {}
  const catParents: Record<string, string> = {}
  const categories = shop.categories?.category || []
  for (const cat of Array.isArray(categories) ? categories : [categories]) {
    const cid = String(cat["@_id"] || "")
    const name = typeof cat === "object" ? (cat["#text"] || "") : String(cat)
    catMap[cid] = name
    const parentId = cat["@_parentId"]
    if (parentId) catParents[cid] = String(parentId)
  }

  function getCategoryChain(cid: string): string[] {
    const chain: string[] = []
    const visited = new Set<string>()
    let current: string | undefined = cid
    while (current && !visited.has(current)) {
      visited.add(current)
      if (catMap[current]) chain.push(catMap[current])
      current = catParents[current]
    }
    return chain
  }

  function detectGender(cid: string): string | null {
    let current: string | undefined = cid
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      visited.add(current)
      if (FEMALE_CATS.has(current)) return "female"
      if (MALE_CATS.has(current)) return "male"
      current = catParents[current]
    }
    return null
  }

  const offers = shop.offers?.offer || []
  const items: ParsedFeedItem[] = []
  let skippedCategories = 0
  let skippedNoImage = 0

  for (const offer of Array.isArray(offers) ? offers : [offers]) {
    const categoryId = String(offer.categoryId || "")
    const chain = getCategoryChain(categoryId)

    // Check skip categories
    if (chain.some((c) => SKIP_CATEGORIES.has(c.toLowerCase().trim()))) {
      skippedCategories++
      continue
    }

    // Map clothing type
    const categoryName = catMap[categoryId] || ""
    const parentId = catParents[categoryId]
    const parentName = parentId ? catMap[parentId] || "" : ""
    const clothingType = mapClothingType(categoryName, parentName)

    if (!clothingType) {
      skippedCategories++
      continue
    }

    // Get image
    let pictures = offer.picture
    if (!pictures) {
      skippedNoImage++
      continue
    }
    if (!Array.isArray(pictures)) pictures = [pictures]
    const imageUrl = pictures[0]
    if (!imageUrl) {
      skippedNoImage++
      continue
    }

    const itemName = offer.name || offer.model || ""
    if (!itemName) continue

    const description = (offer.description || "").slice(0, 500)
    const url = offer.url || ""
    const modelId = offer["@_id"] || offer["@_group_id"] || ""
    const price = offer.price ? parseFloat(offer.price) : null
    const gender = detectGender(categoryId)
    const color = extractColor(itemName)

    items.push({
      item_name: itemName,
      description,
      image_url: String(imageUrl),
      url,
      clothing_type: clothingType,
      color,
      gender,
      source: shopName,
      source_sku: String(modelId),
      price,
    })
  }

  return {
    items,
    shopName,
    totalOffers: Array.isArray(offers) ? offers.length : 1,
    skippedCategories,
    skippedNoImage,
  }
}
