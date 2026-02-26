/**
 * Audit: check which columns have missing data across wardrobe tables.
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
await client.connect()

// ─── Get column info ────────────────────────────────────────────
async function auditTable(tableName) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`TABLE: ${tableName}`)
  console.log("=".repeat(60))

  // Get all columns
  const { rows: cols } = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [tableName])

  console.log(`\nColumns: ${cols.map(c => c.column_name).join(", ")}`)

  // Count total
  const { rows: [{ count: total }] } = await client.query(`SELECT count(*) FROM ${tableName}`)
  console.log(`Total rows: ${total}\n`)

  // For each column, count nulls and empties
  console.log("Column".padEnd(25) + "Filled".padEnd(10) + "NULL".padEnd(10) + "Empty str".padEnd(10) + "% filled")
  console.log("-".repeat(65))

  for (const col of cols) {
    const colName = col.column_name
    try {
      const { rows: [r] } = await client.query(`
        SELECT
          count(*) as total,
          count(${colName}) as not_null,
          count(*) - count(${colName}) as is_null,
          count(CASE WHEN ${colName}::text = '' THEN 1 END) as empty_str
        FROM ${tableName}
      `)
      const filled = Number(r.not_null) - Number(r.empty_str)
      const pct = total > 0 ? Math.round(filled / Number(total) * 100) : 0
      const marker = pct < 50 ? " ⚠️" : pct < 90 ? " ⬜" : ""
      console.log(
        colName.padEnd(25) +
        String(filled).padEnd(10) +
        String(r.is_null).padEnd(10) +
        String(r.empty_str).padEnd(10) +
        `${pct}%${marker}`
      )
    } catch {
      console.log(colName.padEnd(25) + "(error reading)")
    }
  }
}

// ─── Sample items with missing clothing_type ────────────────────
async function sampleMissing(tableName, nameCol) {
  console.log(`\n--- ${tableName}: clothing_type values ---`)
  const { rows } = await client.query(`
    SELECT clothing_type, count(*) as cnt
    FROM ${tableName}
    GROUP BY clothing_type
    ORDER BY cnt DESC
  `)
  console.table(rows)

  console.log(`\n--- ${tableName}: sample items with NULL important fields ---`)
  const { rows: samples } = await client.query(`
    SELECT id, ${nameCol} as name, clothing_type, color, material, style, gender
    FROM ${tableName}
    WHERE clothing_type IS NULL
       OR clothing_type NOT IN ('blouse','lonsleeve','shirt','t-shirt','tank-top',
         'cardigan','hoodie','hoddie','pullover','suit-jacket','sweatshirt','turtleneck','vest',
         'dress','skirt','jeans','pants','sporty-pants',
         'classic','knitted-suit','tracksuit',
         'coat','fur-coat','fur-coat-dark-brown','parka','puffer-jacket','sheepskin-coat')
    LIMIT 20
  `)
  console.table(samples)
}

await auditTable("basic_wardrobe_items")
await auditTable("wardrobe_user_items")
await auditTable("wardrobe_items")

await sampleMissing("basic_wardrobe_items", "name_ru")
await sampleMissing("wardrobe_user_items", "item_name")
await sampleMissing("wardrobe_items", "item_name")

await client.end()
console.log("\n✅ Audit complete")
