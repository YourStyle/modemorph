// lib/recommendation-filters.ts
// Isomorphic module — works on both server (API routes) and client (React)

import { clothingCategories } from "./clothing-types"

// ─── Types ──────────────────────────────────────────────────────
export interface FilterableItem {
  id?: string | number
  name?: string
  image_url?: string
  clothing_type?: string
  user_id?: string
  [key: string]: unknown
}

export interface OutfitSuggestion {
  id?: string
  title?: string
  items: FilterableItem[]
  suggested_items_count?: number
  [key: string]: unknown
}

export interface LookSection {
  title?: string
  looks_count?: number
  suggestions: OutfitSuggestion[]
  [key: string]: unknown
}

export interface FilterStats {
  removedNoImage: number
  removedNoRequiredFields: number
  removedDuplicateId: number
  removedDuplicateSlot: number
  removedEmptyOutfits: number
  removedEmptySections: number
  totalRemoved: number
}

// ─── Slot mapping (derived from clothingCategories) ─────────────
const SLOT_MAP: Record<string, string> = {
  "light-upper": "top",
  "warm-upper": "layer",
  "dresses-skirts": "dress",
  pants: "bottom",
  sets: "set",
  outerwear: "outerwear",
}

/** Map from individual clothing_type → slot name */
const clothingTypeToSlot: Record<string, string> = {}
for (const [categoryKey, category] of Object.entries(clothingCategories)) {
  const slot = SLOT_MAP[categoryKey]
  if (!slot) continue
  for (const type of category.types) {
    clothingTypeToSlot[type] = slot
  }
}

// ─── Item-level filters ─────────────────────────────────────────

export function hasValidImage(item: FilterableItem): boolean {
  return typeof item.image_url === "string" && item.image_url.trim().length > 0
}

export function hasRequiredFields(item: FilterableItem): boolean {
  return (
    item.id != null &&
    String(item.id).trim().length > 0 &&
    typeof item.name === "string" &&
    item.name.trim().length > 0
  )
}

export function deduplicateById(items: FilterableItem[]): FilterableItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = String(item.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Keep max 1 item per category slot.
 * Priority: user items (has user_id) > basic/suggested items.
 * Items without clothing_type pass through (not slot-deduplicated).
 */
export function deduplicateByCategorySlot(
  items: FilterableItem[],
): FilterableItem[] {
  const slotWinner = new Map<string, FilterableItem>()
  const noSlotItems: FilterableItem[] = []

  for (const item of items) {
    const slot = item.clothing_type
      ? clothingTypeToSlot[item.clothing_type]
      : undefined

    if (!slot) {
      noSlotItems.push(item)
      continue
    }

    const existing = slotWinner.get(slot)
    if (!existing) {
      slotWinner.set(slot, item)
    } else {
      // Prefer user item over basic
      const existingIsUser = !!existing.user_id
      const currentIsUser = !!item.user_id
      if (currentIsUser && !existingIsUser) {
        slotWinner.set(slot, item)
      }
      // else keep existing (first-wins for same priority)
    }
  }

  return [...slotWinner.values(), ...noSlotItems]
}

// ─── Outfit-level filter ────────────────────────────────────────

export function filterOutfitItems(items: FilterableItem[]): {
  filtered: FilterableItem[]
  stats: Pick<
    FilterStats,
    | "removedNoImage"
    | "removedNoRequiredFields"
    | "removedDuplicateId"
    | "removedDuplicateSlot"
  >
} {
  const stats = {
    removedNoImage: 0,
    removedNoRequiredFields: 0,
    removedDuplicateId: 0,
    removedDuplicateSlot: 0,
  }

  // 1. Required fields
  let result = items.filter((item) => {
    if (!hasRequiredFields(item)) {
      stats.removedNoRequiredFields++
      return false
    }
    return true
  })

  // 2. Valid image
  result = result.filter((item) => {
    if (!hasValidImage(item)) {
      stats.removedNoImage++
      return false
    }
    return true
  })

  // 3. Deduplicate by id
  const beforeDedup = result.length
  result = deduplicateById(result)
  stats.removedDuplicateId = beforeDedup - result.length

  // 4. Deduplicate by category slot
  const beforeSlot = result.length
  result = deduplicateByCategorySlot(result)
  stats.removedDuplicateSlot = beforeSlot - result.length

  return { filtered: result, stats }
}

// ─── Section-level filter ───────────────────────────────────────

export function filterSections(
  sections: LookSection[],
  minItems = 2,
): { sections: LookSection[]; stats: FilterStats } {
  const stats: FilterStats = {
    removedNoImage: 0,
    removedNoRequiredFields: 0,
    removedDuplicateId: 0,
    removedDuplicateSlot: 0,
    removedEmptyOutfits: 0,
    removedEmptySections: 0,
    totalRemoved: 0,
  }

  const cleaned = sections
    .map((section) => {
      const cleanedSuggestions = (section.suggestions || [])
        .map((suggestion) => {
          const { filtered, stats: itemStats } = filterOutfitItems(
            suggestion.items || [],
          )
          stats.removedNoImage += itemStats.removedNoImage
          stats.removedNoRequiredFields += itemStats.removedNoRequiredFields
          stats.removedDuplicateId += itemStats.removedDuplicateId
          stats.removedDuplicateSlot += itemStats.removedDuplicateSlot

          return { ...suggestion, items: filtered }
        })
        .filter((suggestion) => {
          if (suggestion.items.length < minItems) {
            stats.removedEmptyOutfits++
            return false
          }
          return true
        })

      return {
        ...section,
        suggestions: cleanedSuggestions,
        looks_count: cleanedSuggestions.length,
      }
    })
    .filter((section) => {
      if (section.suggestions.length === 0) {
        stats.removedEmptySections++
        return false
      }
      return true
    })

  stats.totalRemoved =
    stats.removedNoImage +
    stats.removedNoRequiredFields +
    stats.removedDuplicateId +
    stats.removedDuplicateSlot +
    stats.removedEmptyOutfits +
    stats.removedEmptySections

  return { sections: cleaned, stats }
}
