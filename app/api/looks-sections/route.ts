import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

interface LookItem {
  type: "user" | "basic"
  id: number
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

    console.log("Fetching looks sections for user:", user.id)

    const { data: sections, error } = await supabase
      .from("looks_sections")
      .select(`
        *,
        section_looks (
          look_id,
          user_looks (*)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching looks sections:", error)
      return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 })
    }

    console.log("Raw sections from database:", sections)

    // Expand items for each look in each section
    const expandedSections = await Promise.all(
      sections.map(async (section) => {
        if (section.section_looks) {
          const expandedSectionLooks = await Promise.all(
            section.section_looks.map(async (sectionLook: any) => {
              if (sectionLook.user_looks) {
                const expandedItems = await expandLookItems(supabase, sectionLook.user_looks.items || [])
                return {
                  ...sectionLook,
                  user_looks: {
                    ...sectionLook.user_looks,
                    expandedItems,
                  },
                }
              }
              return sectionLook
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

    console.log("Expanded sections:", expandedSections)

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
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    console.log("Creating looks section:", { name, description })

    const { data: newSection, error } = await supabase
      .from("looks_sections")
      .insert({
        user_id: user.id,
        name,
        description,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating looks section:", error)
      return NextResponse.json({ error: "Failed to create section" }, { status: 500 })
    }

    console.log("Created looks section:", newSection)

    return NextResponse.json(newSection)
  } catch (error) {
    console.error("Error in POST /api/looks-sections:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
