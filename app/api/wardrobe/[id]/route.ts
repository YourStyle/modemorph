import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const itemId = Number.parseInt(params.id)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 })
    }

    // Check if user is admin to determine visibility filter
    const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()
    const isAdmin = profile?.is_admin || false

    let query = supabase
      .from("wardrobe_items")
      .select(
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
      .eq("id", itemId)

    // Non-admin users can only see non-hidden items
    if (!isAdmin) {
      query = query.eq("is_hidden", false)
    }

    const { data: item, error } = await query.single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Item not found" }, { status: 404 })
      }
      console.error("Error fetching wardrobe item:", error)
      return NextResponse.json({ error: "Failed to fetch wardrobe item" }, { status: 500 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error("Error in GET /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const itemId = Number.parseInt(params.id)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 })
    }

    // Check existence
    const { data: checkData, error: checkError } = await supabase.from("wardrobe_items").select("*").eq("id", itemId)

    if (checkError) {
      console.error("Error checking item existence:", checkError)
      return NextResponse.json({ error: `Database check error: ${checkError.message}` }, { status: 500 })
    }

    if (!checkData || checkData.length === 0) {
      return NextResponse.json({ error: "Item not found in database" }, { status: 404 })
    }

    const { data: deleteData, error: deleteError } = await supabase
      .from("wardrobe_items")
      .delete()
      .eq("id", itemId)
      .select()

    if (deleteError) {
      console.error("Error deleting wardrobe item:", deleteError)
      return NextResponse.json({ error: `Database delete error: ${deleteError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: deleteData })
  } catch (error) {
    console.error("Error in DELETE /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Toggle visibility only
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const itemId = Number.parseInt(params.id)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: "Invalid item ID" }, { status: 400 })
    }

    const body = await request.json()
    const { is_hidden } = body

    if (typeof is_hidden !== "boolean") {
      return NextResponse.json({ error: "Invalid is_hidden value" }, { status: 400 })
    }

    const { data: checkData, error: checkError } = await supabase.from("wardrobe_items").select("*").eq("id", itemId)

    if (checkError) {
      console.error("Error checking item existence:", checkError)
      return NextResponse.json({ error: `Database check error: ${checkError.message}` }, { status: 500 })
    }

    if (!checkData || checkData.length === 0) {
      return NextResponse.json({ error: "Item not found in database" }, { status: 404 })
    }

    const { data: updateData, error: updateError } = await supabase
      .from("wardrobe_items")
      .update({ is_hidden })
      .eq("id", itemId)
      .select()

    if (updateError) {
      console.error("Error updating wardrobe item visibility:", updateError)
      return NextResponse.json({ error: `Database error: ${updateError.message}` }, { status: 500 })
    }

    if (!updateData || updateData.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, updated: updateData })
  } catch (error) {
    console.error("Error in PATCH /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Full update for admin edit page
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Check admin
    const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const itemId = Number.parseInt(params.id)
    if (isNaN(itemId)) return NextResponse.json({ error: "Invalid item ID" }, { status: 400 })

    const body = await request.json()

    const normalizeBool = (v: unknown): boolean | null => {
      if (v === null || typeof v === "undefined") return null
      if (typeof v === "boolean") return v
      if (typeof v === "string") {
        const s = v.trim().toLowerCase()
        if (["y", "yes", "true", "1", "да"].includes(s)) return true
        return false
      }
      if (typeof v === "number") return v === 1
      return null
    }

    const updateData: Record<string, unknown> = {
      item_name: body.item_name ?? undefined,
      item_name_en: body.item_name_en ?? undefined,
      description: body.description ?? undefined,
      description_en: body.description_en ?? undefined,
      size_type: body.size_type ?? undefined,
      material: body.material ?? undefined,
      style: body.style ?? undefined,
      color: body.color ?? undefined,
      shade: body.shade ?? undefined,
      url: body.url ?? undefined,
      notes: body.notes ?? undefined,
      image_url: body.image_url ?? undefined,
      clothing_type: body.clothing_type ?? undefined,
      is_basic: typeof body.is_basic === "boolean" ? body.is_basic : undefined,
    }

    const hp = normalizeBool(body.has_print)
    if (hp !== null) updateData.has_print = hp
    const hd = normalizeBool(body.has_details)
    if (hd !== null) updateData.has_details = hd

    // Remove undefined keys
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k])

    const { data, error } = await supabase.from("wardrobe_items").update(updateData).eq("id", itemId).select().single()

    if (error) {
      console.error("Error updating wardrobe item:", error)
      return NextResponse.json({ error: "Failed to update item" }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (error) {
    console.error("Error in PUT /api/wardrobe/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
