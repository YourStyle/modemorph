import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""

    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()
    const isAdmin = profile?.is_admin || false

    let query = supabase.from("wardrobe_items").select(
      `
      *,
      basic_wardrobe_items (
        id,
        name_ru,
        name_en,
        description,
        image_url
      )
    `,
    )

    if (!isAdmin) {
      query = query.eq("is_hidden", false)
    }

    if (search) {
      query = query.or(`item_name.ilike.%${search}%,color.ilike.%${search}%,material.ilike.%${search}%`)
    }

    query = query.order("item_name")

    const { data: items, error } = await query

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch wardrobe items" }, { status: 500 })
    }

    return NextResponse.json({ items: items || [] })
  } catch (error) {
    console.error("Error in wardrobe API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Normalize booleans and optional fields
    const normalizeBool = (v: unknown): boolean => {
      if (typeof v === "boolean") return v
      if (typeof v === "string") {
        const s = v.trim().toLowerCase()
        if (["y", "yes", "true", "1", "да"].includes(s)) return true
        return false
      }
      if (typeof v === "number") return v === 1
      return false
    }

    const dataToInsert = {
      item_name: body.item_name,
      item_name_en: body.item_name_en ?? null,
      description: body.description ?? null,
      description_en: body.description_en ?? null,
      size_type: body.size_type ?? "",
      material: body.material ?? "",
      style: body.style ?? "",
      has_print: normalizeBool(body.has_print),
      color: body.color ?? "",
      shade: body.shade ?? "",
      has_details: normalizeBool(body.has_details),
      url: body.url ?? "",
      image_url: body.image_url ?? null,
      is_basic: body.is_basic ?? false,
      basic_item_id: body.basic_item_id ?? null,
      basic_material_id: body.basic_material_id ?? null,
      notes: body.notes ?? null,
      clothing_type: body.clothing_type ?? null,
      is_hidden: false,
    }

    const { data, error } = await supabase.from("wardrobe_items").insert(dataToInsert).select().single()

    if (error) {
      console.error("Error adding wardrobe item:", error)
      return NextResponse.json({ error: "Failed to add wardrobe item" }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (error) {
    console.error("Error in wardrobe POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
