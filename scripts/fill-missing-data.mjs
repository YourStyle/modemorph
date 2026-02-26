/**
 * Fill missing clothing_type, item_name_en, description across all wardrobe tables.
 * Run: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fill-missing-data.mjs
 */

import pg from "pg"
import { readFileSync } from "fs"

const envContent = readFileSync(".env", "utf-8")
const env = {}
for (const line of envContent.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const client = new pg.Client({
  connectionString: env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
})

// ─── clothing_type mapping: Russian keyword → English type key ──
// Ordered from most specific to least (longer matches first)
const NAME_TO_TYPE = [
  // Outerwear
  ["шуба",            "fur-coat"],
  ["дублёнка",        "sheepskin-coat"],
  ["дубленка",        "sheepskin-coat"],
  ["пуховик",         "puffer-jacket"],
  ["парка",           "parka"],
  ["пальто",          "coat"],

  // Warm upper
  ["водолазка",       "turtleneck"],
  ["свитшот",         "sweatshirt"],
  ["свитер",          "pullover"],
  ["кардиган",        "cardigan"],
  ["худи",            "hoodie"],
  ["пуловер",         "pullover"],
  ["толстовка",       "sweatshirt"],

  // Jackets / suits
  ["блейзер",         "suit-jacket"],
  ["пиджак",          "suit-jacket"],
  ["жакет",           "suit-jacket"],
  ["жилет",           "vest"],
  ["жилетка",         "vest"],
  ["бомбер",          "hoodie"],

  // Light upper
  ["рубашка",         "shirt"],
  ["блузка",          "blouse"],
  ["блуза",           "blouse"],
  ["лонгслив",        "lonsleeve"],
  ["поло",            "shirt"],
  ["футболка",        "t-shirt"],
  ["футблока",        "t-shirt"],
  ["топ",             "tank-top"],
  ["майка",           "tank-top"],
  ["боди",            "blouse"],
  ["корсет",          "blouse"],
  ["сорочка",         "shirt"],
  ["туника",          "blouse"],

  // Dresses / skirts
  ["сарафан",         "dress"],
  ["платье",          "dress"],
  ["юбка",            "skirt"],
  ["комбинезон",      "dress"],
  ["кюлоты",          "skirt"],
  ["комбинация",      "dress"],

  // Pants
  ["шорты",           "sporty-pants"],
  ["джинсы",          "jeans"],
  ["брюки",           "pants"],
  ["штаны",           "pants"],
  ["леггинсы",        "sporty-pants"],
  ["легинсы",         "sporty-pants"],
  ["джоггеры",        "sporty-pants"],
  ["чиносы",          "pants"],
  ["чинос",           "pants"],
  ["велосипедки",     "sporty-pants"],

  // Sets
  ["костюм вязаный",  "knitted-suit"],
  ["костюм спортив",  "tracksuit"],
  ["костюм",          "classic"],

  // English system names (for wardrobe_items)
  ["puffer-jacket",   "puffer-jacket"],
  ["puffer_jacket",   "puffer-jacket"],
  ["sheepskin-coat",  "sheepskin-coat"],
  ["sheepskin_coat",  "sheepskin-coat"],
  ["fur-coat",        "fur-coat"],
  ["fur_coat",        "fur-coat"],
  ["parka",           "parka"],
  ["coat",            "coat"],
  ["suit-jacket",     "suit-jacket"],
  ["suit_jacket",     "suit-jacket"],
  ["sporty-pants",    "sporty-pants"],
  ["sporty_pants",    "sporty-pants"],
  ["sweatpants",      "sporty-pants"],
  ["turtleneck",      "turtleneck"],
  ["cardigan",        "cardigan"],
  ["hoodie",          "hoodie"],
  ["pullover",        "pullover"],
  ["sweatshirt",      "sweatshirt"],
  ["vest",            "vest"],
  ["lonsleeve",       "lonsleeve"],
  ["longsleeve",      "lonsleeve"],
  ["t-shirt",         "t-shirt"],
  ["t_shirt",         "t-shirt"],
  ["tank-top",        "tank-top"],
  ["tank_top",        "tank-top"],
  ["shirt",           "shirt"],
  ["blouse",          "blouse"],
  ["jeans",           "jeans"],
  ["pants",           "pants"],
  ["dress",           "dress"],
  ["skirt",           "skirt"],
  ["tracksuit",       "tracksuit"],
  ["knitted-suit",    "knitted-suit"],
  ["knitted_suit",    "knitted-suit"],
  ["classic",         "classic"],
]

function matchClothingType(name) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  for (const [keyword, type] of NAME_TO_TYPE) {
    if (lower.includes(keyword)) return type
  }
  return null
}

// ─── Russian → English name translation map ─────────────────────
const RU_TO_EN = [
  ["шуба",            "fur coat"],
  ["дублёнка",        "sheepskin coat"],
  ["дубленка",        "sheepskin coat"],
  ["пуховик",         "puffer jacket"],
  ["парка",           "parka"],
  ["пальто",          "coat"],
  ["куртка",          "jacket"],
  ["ветровка",        "windbreaker"],
  ["тренч",           "trench coat"],
  ["плащ",            "raincoat"],
  ["анорак",          "anorak"],
  ["бомбер",          "bomber jacket"],
  ["водолазка",       "turtleneck"],
  ["свитшот",         "sweatshirt"],
  ["свитер",          "sweater"],
  ["кардиган",        "cardigan"],
  ["худи",            "hoodie"],
  ["пуловер",         "pullover"],
  ["толстовка",       "sweatshirt"],
  ["олимпийка",       "track jacket"],
  ["блейзер",         "blazer"],
  ["пиджак",          "blazer"],
  ["жакет",           "jacket"],
  ["жилет",           "vest"],
  ["жилетка",         "vest"],
  ["рубашка",         "shirt"],
  ["блузка",          "blouse"],
  ["блуза",           "blouse"],
  ["лонгслив",        "long sleeve"],
  ["поло",            "polo shirt"],
  ["футболка",        "t-shirt"],
  ["топ",             "top"],
  ["майка",           "tank top"],
  ["боди",            "bodysuit"],
  ["корсет",          "corset"],
  ["бралетт",         "bralette"],
  ["туника",          "tunic"],
  ["сорочка",         "shirt"],
  ["кроп-топ",        "crop top"],
  ["сарафан",         "sundress"],
  ["платье",          "dress"],
  ["юбка",            "skirt"],
  ["комбинезон",      "jumpsuit"],
  ["комбинация",      "slip dress"],
  ["кюлоты",          "culottes"],
  ["шорты",           "shorts"],
  ["бриджи",          "capri pants"],
  ["джинсы",          "jeans"],
  ["брюки",           "trousers"],
  ["штаны",           "pants"],
  ["леггинсы",        "leggings"],
  ["легинсы",         "leggings"],
  ["джоггеры",        "joggers"],
  ["велосипедки",     "bike shorts"],
  ["чиносы",          "chinos"],
  ["чинос",           "chinos"],
  ["костюм",          "suit"],
  ["кроссовки",       "sneakers"],
  ["кеды",            "canvas shoes"],
  ["лоферы",          "loafers"],
  ["мокасины",        "moccasins"],
  ["туфли",           "heels"],
  ["ботинки",         "boots"],
  ["ботильоны",       "ankle boots"],
  ["сапоги",          "boots"],
  ["босоножки",       "sandals"],
  ["сандалии",        "sandals"],
  ["сандали",         "sandals"],
  ["мюли",            "mules"],
  ["балетки",         "flats"],
  ["сланцы",          "flip flops"],
  ["шлёпанцы",        "slides"],
  ["шлепанцы",        "slides"],
  ["угги",            "ugg boots"],
  ["сабо",            "clogs"],
  ["шапка",           "beanie"],
  ["берет",           "beret"],
  ["кепка",           "cap"],
  ["бейсболка",       "baseball cap"],
  ["панама",          "bucket hat"],
  ["шляпа",           "hat"],
  ["шарф",            "scarf"],
  ["палантин",        "pashmina"],
  ["платок",          "kerchief"],
  ["перчатки",        "gloves"],
  ["варежки",         "mittens"],
  ["очки",            "glasses"],
  ["сумка",           "bag"],
  ["рюкзак",          "backpack"],
  ["клатч",           "clutch"],
  ["ремень",          "belt"],
  ["пояс",            "belt"],
  ["часы",            "watch"],
  ["ожерелье",        "necklace"],
  ["колье",           "necklace"],
  ["браслет",         "bracelet"],
  ["серьги",          "earrings"],
  ["кольцо",          "ring"],
  ["подвеска",        "pendant"],
  ["цепочка",         "chain"],
  ["зонт",            "umbrella"],
  ["кофта",           "cardigan"],
  ["джемпер",         "jumper"],
  ["безрукавка",      "sleeveless top"],
  ["халат",           "robe"],
  ["кейп",            "cape"],
  ["накидка",         "poncho"],
  ["пончо",           "poncho"],
  ["носки",           "socks"],
]

function translateName(ruName) {
  if (!ruName) return null
  const lower = ruName.toLowerCase().trim()
  for (const [keyword, en] of RU_TO_EN) {
    if (lower.includes(keyword)) return en
  }
  return null
}

// ─── Description generation ─────────────────────────────────────
function generateDescription(name, color, material, style) {
  const parts = [name]
  if (color && color.trim()) parts.push(color.trim())
  if (material && material.trim()) parts.push(material.trim())
  if (style && style.trim()) parts.push(`стиль: ${style.trim()}`)
  return parts.join(", ")
}

function generateDescriptionEn(nameEn, color, material, style) {
  const parts = [nameEn]
  if (color && color.trim()) parts.push(color.trim())
  if (material && material.trim()) parts.push(material.trim())
  if (style && style.trim()) parts.push(`style: ${style.trim()}`)
  return parts.join(", ")
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("📝 Fill Missing Data Script")
  console.log("===========================\n")

  await client.connect()
  console.log("✅ Connected\n")

  // ─── 1. Fix clothing_type across all tables ───────────────────

  console.log("=== Step 1: Fix clothing_type ===\n")

  // basic_wardrobe_items
  {
    const { rows } = await client.query(
      `SELECT id, name_ru FROM basic_wardrobe_items`
    )
    let updated = 0
    for (const row of rows) {
      const type = matchClothingType(row.name_ru)
      if (type) {
        await client.query(
          `UPDATE basic_wardrobe_items SET clothing_type = $1 WHERE id = $2`,
          [type, row.id]
        )
        updated++
      }
    }
    console.log(`basic_wardrobe_items: ${updated}/${rows.length} clothing_type updated`)
  }

  // wardrobe_user_items
  {
    const { rows } = await client.query(
      `SELECT id, item_name FROM wardrobe_user_items`
    )
    let updated = 0
    let unmatched = 0
    for (const row of rows) {
      const type = matchClothingType(row.item_name)
      if (type) {
        await client.query(
          `UPDATE wardrobe_user_items SET clothing_type = $1 WHERE id = $2`,
          [type, row.id]
        )
        updated++
      } else {
        unmatched++
      }
    }
    console.log(`wardrobe_user_items: ${updated}/${rows.length} updated, ${unmatched} unmatched`)
  }

  // wardrobe_items
  {
    const { rows } = await client.query(
      `SELECT id, item_name FROM wardrobe_items`
    )
    let updated = 0
    for (const row of rows) {
      const type = matchClothingType(row.item_name)
      if (type) {
        await client.query(
          `UPDATE wardrobe_items SET clothing_type = $1 WHERE id = $2`,
          [type, row.id]
        )
        updated++
      }
    }
    console.log(`wardrobe_items: ${updated}/${rows.length} updated`)
  }

  // ─── 2. Fill item_name_en ─────────────────────────────────────

  console.log("\n=== Step 2: Fill item_name_en ===\n")

  // wardrobe_user_items — all 885 are NULL
  {
    const { rows } = await client.query(
      `SELECT id, item_name FROM wardrobe_user_items WHERE item_name_en IS NULL`
    )
    let updated = 0
    for (const row of rows) {
      const en = translateName(row.item_name)
      if (en) {
        await client.query(
          `UPDATE wardrobe_user_items SET item_name_en = $1 WHERE id = $2`,
          [en, row.id]
        )
        updated++
      }
    }
    console.log(`wardrobe_user_items: ${updated}/${rows.length} item_name_en filled`)
  }

  // wardrobe_items — 244 NULL
  {
    const { rows } = await client.query(
      `SELECT id, item_name FROM wardrobe_items WHERE item_name_en IS NULL`
    )
    let updated = 0
    for (const row of rows) {
      const en = translateName(row.item_name)
      if (en) {
        await client.query(
          `UPDATE wardrobe_items SET item_name_en = $1 WHERE id = $2`,
          [en, row.id]
        )
        updated++
      }
    }
    console.log(`wardrobe_items: ${updated}/${rows.length} item_name_en filled`)
  }

  // ─── 3. Fill description / description_en ─────────────────────

  console.log("\n=== Step 3: Fill descriptions ===\n")

  // wardrobe_user_items
  {
    const { rows } = await client.query(
      `SELECT id, item_name, item_name_en, color, material, style
       FROM wardrobe_user_items
       WHERE description IS NULL`
    )
    let updated = 0
    for (const row of rows) {
      const desc = generateDescription(row.item_name, row.color, row.material, row.style)
      const nameEn = row.item_name_en || translateName(row.item_name)
      const descEn = nameEn
        ? generateDescriptionEn(nameEn, row.color, row.material, row.style)
        : null

      const updates = { description: desc }
      if (descEn) updates.description_en = descEn

      const setClauses = Object.entries(updates)
        .map(([k], i) => `${k} = $${i + 1}`)
        .join(", ")
      const values = [...Object.values(updates), row.id]

      await client.query(
        `UPDATE wardrobe_user_items SET ${setClauses} WHERE id = $${values.length}`,
        values
      )
      updated++
    }
    console.log(`wardrobe_user_items: ${updated}/${rows.length} descriptions filled`)
  }

  // wardrobe_items
  {
    const { rows } = await client.query(
      `SELECT id, item_name, item_name_en, color, material, style
       FROM wardrobe_items
       WHERE description IS NULL`
    )
    let updated = 0
    for (const row of rows) {
      const desc = generateDescription(row.item_name, row.color, row.material, row.style)
      const nameEn = row.item_name_en || translateName(row.item_name)
      const descEn = nameEn
        ? generateDescriptionEn(nameEn, row.color, row.material, row.style)
        : null

      const updates = { description: desc }
      if (descEn) updates.description_en = descEn

      const setClauses = Object.entries(updates)
        .map(([k], i) => `${k} = $${i + 1}`)
        .join(", ")
      const values = [...Object.values(updates), row.id]

      await client.query(
        `UPDATE wardrobe_items SET ${setClauses} WHERE id = $${values.length}`,
        values
      )
      updated++
    }
    console.log(`wardrobe_items: ${updated}/${rows.length} descriptions filled`)
  }

  // ─── 4. Final audit ───────────────────────────────────────────

  console.log("\n=== Final Audit ===\n")

  for (const t of [
    { name: "basic_wardrobe_items", cols: "clothing_type" },
    { name: "wardrobe_user_items", cols: "clothing_type, item_name_en, description" },
    { name: "wardrobe_items", cols: "clothing_type, item_name_en, description" },
  ]) {
    const { rows: [r] } = await client.query(`SELECT count(*) as total FROM ${t.name}`)
    console.log(`${t.name} (${r.total} rows):`)

    for (const col of t.cols.split(", ")) {
      const { rows: [c] } = await client.query(
        `SELECT count(${col}) as filled, count(*) - count(${col}) as missing FROM ${t.name}`
      )
      console.log(`  ${col.padEnd(20)} ${c.filled} filled / ${c.missing} missing`)
    }
  }

  // Show clothing_type distribution after update
  console.log("\n=== clothing_type distribution after update ===\n")
  for (const t of ["basic_wardrobe_items", "wardrobe_user_items", "wardrobe_items"]) {
    console.log(`--- ${t} ---`)
    const { rows } = await client.query(
      `SELECT clothing_type, count(*) as cnt FROM ${t} GROUP BY clothing_type ORDER BY cnt DESC`
    )
    console.table(rows)
  }

  await client.end()
  console.log("\n🎉 Done!")
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1) })
