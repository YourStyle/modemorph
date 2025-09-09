import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"


async function expandBasicItem(supabase: any, id: number) {
  // 1) пробуем в basic_wardrobe_items (name_ru)
  const { data: b1 } = await supabase
    .from("basic_wardrobe_items")
    .select("id, name_ru, image_url")
    .eq("id", id)
    .maybeSingle?.() ?? { data: null } // если нет maybeSingle в типах, оставь .single() с try/catch

  if (b1) {
    return { ...b1, source: "basic" as const }
  }

  // 2) фолбэк в wardrobe_items (item_name)
  const { data: b2 } = await supabase
    .from("wardrobe_items")
    .select("id, item_name, image_url")
    .eq("id", id)
    .maybeSingle?.() ?? { data: null }

  if (b2) {
    // приводим к ожидаемому полю name_ru, чтобы фронт не менять
    return { id: b2.id, name_ru: b2.item_name, image_url: b2.image_url, source: "basic" as const }
  }

  return null
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Fetching looks for user:", user.id)

    // Get user looks
    const { data: looks, error: looksError } = await supabase
      .from("user_looks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (looksError) {
      console.error("Error fetching looks:", looksError)
      return NextResponse.json({ error: "Failed to fetch looks" }, { status: 500 })
    }

    console.log("Fetched looks:", looks)

    // For each look, expand the items
    const looksWithExpandedItems = await Promise.all(
      looks.map(async (look) => {
        if (!look.items || !Array.isArray(look.items)) {
          return { ...look, expandedItems: [] }
        }

        // Expand items for this look
        const expandedItems = await Promise.all(
          look.items.map(async (item: any) => {
            if (item.type === "user") {
              const { data: userItem } = await supabase
                .from("wardrobe_user_items")
                .select("id, item_name, image_url, color, material")
                .eq("id", item.id)
                .single()

              return userItem
                ? {
                    ...userItem,
                    source: "user",
                  }
                : null
            } else if (item.type === "basic") {
              return await expandBasicItem(supabase, item.id)
            }
            return null
          }),
        )

        return {
          ...look,
          expandedItems: expandedItems.filter(Boolean),
        }
      }),
    )

    return NextResponse.json(looksWithExpandedItems)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, items } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    console.log("Creating look for user:", user.id, { name, description, items })

    // Create the look
    const { data: look, error: lookError } = await supabase
      .from("user_looks")
      .insert({
        user_id: user.id,
        name,
        description,
        items,
      })
      .select()
      .single()

    if (lookError) {
      console.error("Error creating look:", lookError)
      return NextResponse.json({ error: "Failed to create look" }, { status: 500 })
    }

    console.log("Created look:", look)

    // Expand items for the response
    const expandedItems = await Promise.all(
      items.map(async (item: any) => {
        if (item.type === "user") {
          const { data: userItem } = await supabase
            .from("wardrobe_user_items")
            .select("id, item_name, image_url, color, material")
            .eq("id", item.id)
            .single()

          return userItem
            ? {
                ...userItem,
                source: "user",
              }
            : null
        } else if (item.type === "basic") {
          return await expandBasicItem(supabase, item.id)
        }
        return null
      }),
    )

    return NextResponse.json({
      ...look,
      expandedItems: expandedItems.filter(Boolean),
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
