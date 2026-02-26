import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAdminUser } from "@/lib/admin-auth"
import { clothingTypes } from "@/lib/clothing-types"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Build reverse map: Russian display name (lowercase) → clothing type key.
 * E.g. "блузка" → "blouse", "джинсы" → "jeans"
 */
function buildReverseMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, ruName] of Object.entries(clothingTypes)) {
    const lower = ruName.toLowerCase()
    // Skip duplicates like "hoddie" — keep first (canonical) entry
    if (!map.has(lower)) {
      map.set(lower, key)
    }
  }
  return map
}

function matchClothingType(
  name: string,
  reverseMap: Map<string, string>,
): string | null {
  const lower = name.toLowerCase().trim()
  // Exact match first
  if (reverseMap.has(lower)) return reverseMap.get(lower)!
  // Substring match: check if any known Russian name is contained in the item name
  for (const [ruName, typeKey] of reverseMap) {
    if (lower.includes(ruName)) return typeKey
  }
  return null
}

/** POST — scan items without clothing_type and try to match */
export async function POST(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabase()
  const reverseMap = buildReverseMap()

  let matched = 0
  let unmatched = 0
  const unmatchedNames: string[] = []

  // ─── basic_wardrobe_items ───────────────────────────────────
  const { data: basicItems, error: basicErr } = await supabase
    .from("basic_wardrobe_items")
    .select("id, item_name, name_ru")
    .is("clothing_type", null)

  if (basicErr) {
    return NextResponse.json({ error: basicErr.message }, { status: 500 })
  }

  for (const item of basicItems || []) {
    const name = item.name_ru || item.item_name || ""
    const type = matchClothingType(name, reverseMap)
    if (type) {
      const { error } = await supabase
        .from("basic_wardrobe_items")
        .update({ clothing_type: type })
        .eq("id", item.id)
      if (!error) matched++
    } else {
      unmatched++
      if (name && !unmatchedNames.includes(name)) unmatchedNames.push(name)
    }
  }

  // ─── wardrobe_user_items ────────────────────────────────────
  const { data: userItems, error: userErr } = await supabase
    .from("wardrobe_user_items")
    .select("id, item_name")
    .is("clothing_type", null)

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  for (const item of userItems || []) {
    const name = item.item_name || ""
    const type = matchClothingType(name, reverseMap)
    if (type) {
      const { error } = await supabase
        .from("wardrobe_user_items")
        .update({ clothing_type: type })
        .eq("id", item.id)
      if (!error) matched++
    } else {
      unmatched++
      if (name && !unmatchedNames.includes(name)) unmatchedNames.push(name)
    }
  }

  return NextResponse.json({
    matched,
    unmatched,
    unmatchedNames: unmatchedNames.slice(0, 50), // cap for response size
    scanned: {
      basic: basicItems?.length || 0,
      user: userItems?.length || 0,
    },
  })
}
