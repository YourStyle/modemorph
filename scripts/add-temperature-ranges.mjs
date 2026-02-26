/**
 * Script: Populate temp_min / temp_max by matching item names (Russian).
 *
 * Uses direct Postgres connection for DDL + batch updates.
 * Run: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-temperature-ranges.mjs
 */

import pg from "pg"
import { readFileSync } from "fs"

// ─── Load env ───────────────────────────────────────────────────
const envContent = readFileSync(".env", "utf-8")
const env = {}
for (const line of envContent.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const POSTGRES_URL = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL

// ─── Temperature map: Russian keyword → [temp_min, temp_max] ───
// Ordered from most specific to least specific (longer matches first)
const TEMP_BY_NAME = [
  // Обувь
  ["сланцы",          [25, 40]],
  ["шлёпанцы",        [25, 40]],
  ["шлепанцы",        [25, 40]],
  ["сандалии",        [22, 38]],
  ["босоножки",       [20, 38]],
  ["мюли",            [18, 35]],
  ["балетки",         [12, 30]],
  ["кроссовки",       [-5, 30]],
  ["кеды",            [5, 30]],
  ["лоферы",          [5, 28]],
  ["мокасины",        [8, 30]],
  ["туфли",           [5, 28]],
  ["ботинки",         [-10, 15]],
  ["ботильоны",       [-5, 15]],
  ["полуботинки",     [-5, 15]],
  ["сапоги",          [-20, 5]],
  ["угги",            [-25, 5]],
  ["валенки",         [-30, -5]],

  // Верхняя одежда
  ["шуба",            [-30, 0]],
  ["дублёнка",        [-25, 0]],
  ["дубленка",        [-25, 0]],
  ["пуховик",         [-30, 5]],
  ["парка",           [-25, 5]],
  ["пальто",          [-15, 10]],
  ["куртка",          [-15, 15]],
  ["ветровка",        [5, 20]],
  ["тренч",           [5, 20]],
  ["плащ",            [0, 18]],
  ["анорак",          [-5, 15]],

  // Тёплый верх
  ["свитер",          [-5, 15]],
  ["свитшот",         [2, 20]],
  ["водолазка",       [-5, 15]],
  ["кардиган",        [5, 18]],
  ["худи",            [0, 18]],
  ["пуловер",         [0, 18]],
  ["толстовка",       [0, 20]],
  ["олимпийка",       [5, 22]],
  ["бомбер",          [0, 18]],

  // Пиджаки / жакеты
  ["блейзер",         [8, 25]],
  ["пиджак",          [8, 25]],
  ["жакет",           [8, 25]],

  // Жилеты
  ["жилет",           [5, 20]],
  ["жилетка",         [5, 20]],

  // Лёгкий верх
  ["рубашка",         [12, 30]],
  ["блузка",          [15, 30]],
  ["блуза",           [15, 30]],
  ["лонгслив",        [8, 22]],
  ["поло",            [15, 32]],
  ["футболка",        [18, 35]],
  ["топ",             [20, 38]],
  ["майка",           [22, 40]],
  ["кроп-топ",        [22, 38]],
  ["боди",            [15, 35]],
  ["корсет",          [15, 32]],

  // Платья / юбки
  ["платье майка",    [20, 38]],
  ["сарафан",         [20, 38]],
  ["платье",          [10, 35]],
  ["юбка",            [10, 30]],
  ["комбинезон",      [10, 30]],

  // Брюки / низ
  ["шорты",           [20, 40]],
  ["бриджи",          [18, 35]],
  ["джинсы",          [-10, 25]],
  ["брюки",           [-5, 30]],
  ["штаны",           [-5, 28]],
  ["леггинсы",        [-5, 25]],
  ["легинсы",         [-5, 25]],
  ["джоггеры",        [-5, 22]],

  // Комплекты
  ["костюм вязаный",  [-5, 18]],
  ["костюм спортив",  [-5, 22]],
  ["костюм",          [5, 28]],

  // Аксессуары
  ["шапка",           [-30, 10]],
  ["берет",           [-10, 15]],
  ["кепка",           [10, 35]],
  ["панама",          [18, 40]],
  ["шарф",            [-30, 10]],
  ["палантин",        [-10, 15]],
  ["перчатки",        [-30, 5]],
  ["варежки",         [-30, 0]],
  ["очки",            [5, 40]],
  ["сумка",           [-30, 40]],
  ["рюкзак",          [-30, 40]],
  ["ремень",          [-30, 40]],
  ["пояс",            [-30, 40]],
  ["часы",            [-30, 40]],
  ["украшение",       [-30, 40]],
  ["бижутерия",       [-30, 40]],
  ["колье",           [-30, 40]],
  ["браслет",         [-30, 40]],
  ["серьги",          [-30, 40]],
  ["кольцо",          [-30, 40]],
  ["подвеска",        [-30, 40]],
  ["цепочка",         [-30, 40]],
  ["зонт",            [-5, 35]],
]

function matchTemp(name) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  for (const [keyword, range] of TEMP_BY_NAME) {
    if (lower.includes(keyword)) return range
  }
  return null
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("🌡️  Temperature Range Migration (name-based matching)")
  console.log("=====================================================")
  console.log(`Keywords mapped: ${TEMP_BY_NAME.length}\n`)

  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  console.log("✅ Connected to PostgreSQL\n")

  // Step 1: Ensure columns exist
  const tables = [
    { name: "basic_wardrobe_items", nameCol: "name_ru" },
    { name: "wardrobe_user_items",  nameCol: "item_name" },
    { name: "wardrobe_items",       nameCol: "item_name" },
  ]

  for (const t of tables) {
    await client.query(`ALTER TABLE ${t.name} ADD COLUMN IF NOT EXISTS temp_min integer`)
    await client.query(`ALTER TABLE ${t.name} ADD COLUMN IF NOT EXISTS temp_max integer`)
  }
  console.log("✅ Columns temp_min, temp_max ensured on all tables\n")

  // Step 2: Read all items, match, batch update
  let totalUpdated = 0
  let totalUnmatched = 0
  const allUnmatched = []

  for (const t of tables) {
    console.log(`--- ${t.name} ---`)

    const { rows } = await client.query(
      `SELECT id, ${t.nameCol} as name FROM ${t.name} WHERE temp_min IS NULL OR temp_max IS NULL`
    )

    let updated = 0
    let unmatched = 0
    const unmatchedNames = new Set()

    // Batch: group by same temp range
    const batches = new Map() // "min,max" → id[]
    for (const row of rows) {
      const range = matchTemp(row.name)
      if (range) {
        const key = `${range[0]},${range[1]}`
        if (!batches.has(key)) batches.set(key, [])
        batches.get(key).push(row.id)
      } else {
        unmatched++
        if (row.name) unmatchedNames.add(row.name.trim())
      }
    }

    // Execute batch updates
    for (const [key, ids] of batches) {
      const [tMin, tMax] = key.split(",").map(Number)
      const { rowCount } = await client.query(
        `UPDATE ${t.name} SET temp_min = $1, temp_max = $2 WHERE id = ANY($3::int[])`,
        [tMin, tMax, ids],
      )
      updated += rowCount
    }

    totalUpdated += updated
    totalUnmatched += unmatched

    console.log(`  Total without temp: ${rows.length}`)
    console.log(`  ✅ Updated: ${updated}`)
    console.log(`  ⚠️  Unmatched: ${unmatched}`)
    if (unmatchedNames.size > 0) {
      const names = [...unmatchedNames].slice(0, 20)
      console.log(`  Unmatched names: ${names.join(", ")}`)
      allUnmatched.push(...names)
    }
    console.log()
  }

  // Step 3: Final summary
  console.log("=====================================================")
  for (const t of tables) {
    const { rows } = await client.query(
      `SELECT count(*) as total,
              count(temp_min) as with_temp,
              count(*) - count(temp_min) as without_temp
       FROM ${t.name}`
    )
    const r = rows[0]
    console.log(`${t.name}: ${r.total} total | ${r.with_temp} with temp | ${r.without_temp} without`)
  }

  if (allUnmatched.length > 0) {
    console.log(`\n⚠️  Unique unmatched names (first 30):`)
    const unique = [...new Set(allUnmatched)].slice(0, 30)
    for (const n of unique) console.log(`   - "${n}"`)
  }

  await client.end()
  console.log(`\n🎉 Done! Updated: ${totalUpdated}, Unmatched: ${totalUnmatched}`)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
