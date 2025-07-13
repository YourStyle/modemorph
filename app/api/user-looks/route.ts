import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user looks with expanded item details
    const { data: looks, error } = await supabase
      .from("user_looks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user looks:", error)
      return NextResponse.json({ error: "Failed to fetch looks" }, { status: 500 })
    }

    // Expand items for each look
    const expandedLooks = await Promise.all(
      (looks || []).map(async (look) => {
        const expandedItems = await expandLookItems(look.items, supabase)
        return {
          ...look,
          expandedItems,
        }
      }),
    )

    return NextResponse.json(expandedLooks)
  } catch (error) {
    console.error("Error in GET /api/user-looks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
    const { name, description, items, image_url } = body

    if (!name || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Name and items are required" }, { status: 400 })
    }

    // Validate items format: [{"type": "user", "id": 1}, {"type": "basic", "id": 10}]
    const validItems = items.every(
      (item) =>
        typeof item === "object" && item.type && ["user", "basic"].includes(item.type) && typeof item.id === "number",
    )

    if (!validItems) {
      return NextResponse.json({ error: "Invalid items format" }, { status: 400 })
    }

    const { data: look, error } = await supabase
      .from("user_looks")
      .insert({
        user_id: user.id,
        name,
        description: description || null,
        items,
        image_url: image_url || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating user look:", error)
      return NextResponse.json({ error: "Failed to create look" }, { status: 500 })
    }

    // Expand items for response
    const expandedItems = await expandLookItems(look.items, supabase)

    return NextResponse.json({
      ...look,
      expandedItems,
    })
  } catch (error) {
    console.error("Error in POST /api/user-looks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper function to expand item IDs to full item data
async function expandLookItems(items: any[], supabase: any) {
  const expandedItems = []

  for (const item of items) {
    if (item.type === "user") {
      // Get from wardrobe_user_items
      const { data: userItem } = await supabase
        .from("wardrobe_user_items")
        .select(`
          *,
          basic_wardrobe_items (
            name_ru,
            description,
            clothing_type_id
          )
        `)
        .eq("id", item.id)
        .single()

      if (userItem) {
        expandedItems.push({
          ...userItem,
          source: "user",
        })
      }
    } else if (item.type === "basic") {
      // Get from basic_wardrobe_items
      const { data: basicItem } = await supabase.from("basic_wardrobe_items").select("*").eq("id", item.id).single()

      if (basicItem) {
        expandedItems.push({
          ...basicItem,
          source: "basic",
        })
      }
    }
  }

  return expandedItems
}
