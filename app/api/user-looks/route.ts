import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

interface LookItem {
  type: "user" | "basic"
  id: number
}

interface CreateLookRequest {
  name: string
  description?: string
  items: LookItem[]
}

async function expandLookItems(supabase: any, items: LookItem[]) {
  console.log("Expanding look items:", items)
  const expandedItems = []

  for (const item of items) {
    try {
      if (item.type === "user") {
        console.log(`Fetching user item ${item.id}`)
        const { data: userItem, error } = await supabase
          .from("wardrobe_user_items")
          .select("id, item_name, image_url, color, material")
          .eq("id", item.id)
          .single()

        if (error) {
          console.error(`Failed to get user item ${item.id}:`, error)
          continue
        }

        if (userItem) {
          console.log(`Found user item:`, userItem)
          expandedItems.push({
            ...userItem,
            source: "user",
          })
        }
      } else if (item.type === "basic") {
        console.log(`Fetching basic item ${item.id}`)
        const { data: basicItem, error } = await supabase
          .from("wardrobe_items")
          .select("id, item_name, image_url, color, material")
          .eq("id", item.id)
          .single()

        if (error) {
          console.error(`Failed to get basic item ${item.id}:`, error)
          continue
        }

        if (basicItem) {
          console.log(`Found basic item:`, basicItem)
          expandedItems.push({
            ...basicItem,
            source: "basic",
          })
        }
      }
    } catch (error) {
      console.error(`Error processing item ${item.type}:${item.id}:`, error)
    }
  }

  console.log("Final expanded items:", expandedItems)
  return expandedItems
}

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Fetching user looks for user:", user.id)

    const { data: looks, error } = await supabase
      .from("user_looks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user looks:", error)
      return NextResponse.json({ error: "Failed to fetch looks" }, { status: 500 })
    }

    console.log("Raw looks from database:", looks)

    // Expand items for each look
    const expandedLooks = await Promise.all(
      looks.map(async (look) => {
        const expandedItems = await expandLookItems(supabase, look.items || [])
        return {
          ...look,
          expandedItems,
        }
      }),
    )

    console.log("Expanded looks:", expandedLooks)

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
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: CreateLookRequest = await request.json()
    const { name, description, items } = body

    if (!name || !items || items.length === 0) {
      return NextResponse.json({ error: "Name and items are required" }, { status: 400 })
    }

    console.log("Creating look:", { name, description, items })

    const { data: newLook, error } = await supabase
      .from("user_looks")
      .insert({
        user_id: user.id,
        name,
        description,
        items,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating look:", error)
      return NextResponse.json({ error: "Failed to create look" }, { status: 500 })
    }

    // Expand items for the new look
    const expandedItems = await expandLookItems(supabase, newLook.items || [])
    const lookWithExpandedItems = {
      ...newLook,
      expandedItems,
    }

    console.log("Created look with expanded items:", lookWithExpandedItems)

    return NextResponse.json(lookWithExpandedItems)
  } catch (error) {
    console.error("Error in POST /api/user-looks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
