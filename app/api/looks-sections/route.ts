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

    const { data: sections, error } = await supabase
      .from("looks_sections")
      .select(`
        *,
        section_looks (
          look_id,
          user_looks (
            id,
            name,
            description,
            image_url,
            items,
            created_at
          )
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching looks sections:", error)
      return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 })
    }

    // Expand items for each look in sections
    const expandedSections = await Promise.all(
      (sections || []).map(async (section) => {
        if (section.section_looks) {
          const expandedSectionLooks = await Promise.all(
            section.section_looks.map(async (sl) => {
              if (sl.user_looks) {
                const expandedItems = await expandLookItems(sl.user_looks.items, supabase)
                return {
                  ...sl,
                  user_looks: {
                    ...sl.user_looks,
                    expandedItems,
                  },
                }
              }
              return sl
            }),
          )
          return {
            ...section,
            section_looks: expandedSectionLooks,
          }
        }
        return section
      }),
    )

    return NextResponse.json(expandedSections)
  } catch (error) {
    console.error("Error in GET /api/looks-sections:", error)
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
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const { data: section, error } = await supabase
      .from("looks_sections")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating looks section:", error)
      return NextResponse.json({ error: "Failed to create section" }, { status: 500 })
    }

    return NextResponse.json(section)
  } catch (error) {
    console.error("Error in POST /api/looks-sections:", error)
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
