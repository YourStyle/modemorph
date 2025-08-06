import { createClient } from "@/lib/supabase/server"

export interface WardrobeItem {
  id: number
  item_name: string
  size_type: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  url: string
  created_at: string
  updated_at: string
  image_url?: string | null
  is_basic?: boolean
  is_hidden?: boolean
  basic_item_id?: number
  basic_material_id?: number
  notes?: string
  // Связанная базовая вещь для получения типа
  basic_wardrobe_items?: {
    id: number
    name_ru: string
    name_en: string
    description: string | null
    image_url: string | null
  }
}

export async function getWardrobeItems(includeHidden = false): Promise<WardrobeItem[]> {
  const supabase = createClient()

  let query = supabase.from("wardrobe_items").select(`
      *,
      basic_wardrobe_items (
        id,
        name_ru,
        name_en,
        description,
        image_url
      )
    `)

  // Если не включаем скрытые, фильтруем их
  if (!includeHidden) {
    query = query.eq("is_hidden", false)
  }

  query = query.order("item_name")

  const { data, error } = await query

  if (error) {
    console.error("Error fetching wardrobe items:", error)
    return []
  }

  return data || []
}

export async function getVisibleWardrobeItems(): Promise<WardrobeItem[]> {
  return getWardrobeItems(false)
}

export async function getAllWardrobeItems(): Promise<WardrobeItem[]> {
  return getWardrobeItems(true)
}

export async function getWardrobeItemsByBasicType(basicItemId: number, includeHidden = false): Promise<WardrobeItem[]> {
  const supabase = createClient()

  let query = supabase
    .from("wardrobe_items")
    .select(`
      *,
      basic_wardrobe_items (
        id,
        name_ru,
        name_en,
        description,
        image_url
      )
    `)
    .eq("basic_item_id", basicItemId)

  if (!includeHidden) {
    query = query.eq("is_hidden", false)
  }

  query = query.order("item_name")

  const { data, error } = await query

  if (error) {
    console.error("Error fetching wardrobe items by basic type:", error)
    return []
  }

  return data || []
}

export async function searchWardrobeItems(query: string, includeHidden = false): Promise<WardrobeItem[]> {
  const supabase = createClient()

  let dbQuery = supabase
    .from("wardrobe_items")
    .select(`
      *,
      basic_wardrobe_items (
        id,
        name_ru,
        name_en,
        description,
        image_url
      )
    `)
    .or(`item_name.ilike.%${query}%,color.ilike.%${query}%,material.ilike.%${query}%`)

  if (!includeHidden) {
    dbQuery = dbQuery.eq("is_hidden", false)
  }

  dbQuery = dbQuery.order("item_name")

  const { data, error } = await dbQuery

  if (error) {
    console.error("Error searching wardrobe items:", error)
    return []
  }

  return data || []
}

export async function getBasicWardrobeItems(includeHidden = false): Promise<WardrobeItem[]> {
  const supabase = createClient()

  let query = supabase
    .from("wardrobe_items")
    .select(`
      *,
      basic_wardrobe_items (
        id,
        name_ru,
        name_en,
        description,
        image_url
      )
    `)
    .eq("is_basic", true)

  if (!includeHidden) {
    query = query.eq("is_hidden", false)
  }

  query = query.order("item_name")

  const { data, error } = await query

  if (error) {
    console.error("Error fetching basic wardrobe items:", error)
    return []
  }

  return data || []
}

export async function getWardrobeItemById(id: number): Promise<WardrobeItem | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from("wardrobe_items")
    .select(`
      *,
      basic_wardrobe_items (
        id,
        name_ru,
        name_en,
        description,
        image_url
      )
    `)
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching wardrobe item by id:", error)
    return null
  }

  return data
}
