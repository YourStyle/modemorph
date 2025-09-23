import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

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

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data, error } = await supabase
      .from("wardrobe_user_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error in GET /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await req.json()

    const itemData = {
      user_id: user.id,
      item_name: body.item_name || body.name || "Без названия",
      item_name_en: body.item_name_en ?? null,
      description: body.description ?? null,
      description_en: body.description_en ?? null,
      material: body.material || "",
      color: body.color || "",
      style: body.style || "",
      has_print: normalizeBool(body.has_print),
      has_details: normalizeBool(body.has_details),
      image_url: body.image_url || null,
      basic_item_id: body.basic_item_id ? Number.parseInt(body.basic_item_id) : null,
      is_hidden: false,
      size_type: body.size_type || "",
      shade: body.shade || "",
      url: body.url || "",
      notes: body.notes || "",
      clothing_type: body.clothing_type ?? null,
    }

    const { data, error } = await supabase.from("wardrobe_user_items").insert([itemData]).select().single()

    if (error) {
      console.error("Error creating wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create item", details: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in POST /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
