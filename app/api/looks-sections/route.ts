import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      console.error("Auth error: No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    console.log("Fetching sections for user:", user.id)

    // Get sections with their looks
    const { data: sections, error: sectionsError } = await supabase
      .from("looks_sections")
      .select(
        `
        *,
        section_looks (
          look_id,
          user_looks (
            *
          )
        )
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (sectionsError) {
      console.error("Error fetching sections:", sectionsError)
      return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 })
    }

    console.log("Fetched sections:", sections)

    // For each look in each section, expand the items
    const sectionsWithExpandedLooks = await Promise.all(
      sections.map(async (section) => {
        if (!section.section_looks) return section

        const expandedSectionLooks = await Promise.all(
          section.section_looks.map(async (sectionLook: any) => {
            const look = sectionLook.user_looks
            if (!look || !look.items) return sectionLook

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
                  const { data: basicItem } = await supabase
                    .from("wardrobe_items")
                    .select("id, item_name, image_url")
                    .eq("id", item.id)
                    .single()

                  return basicItem
                    ? {
                        ...basicItem,
                        source: "basic",
                      }
                    : null
                }
                return null
              }),
            )

            return {
              ...sectionLook,
              user_looks: {
                ...look,
                expandedItems: expandedItems.filter(Boolean),
              },
            }
          }),
        )

        return {
          ...section,
          section_looks: expandedSectionLooks,
        }
      }),
    )

    return NextResponse.json(sectionsWithExpandedLooks)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      console.error("Auth error: No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    console.log("Creating section for user:", user.id, { name, description })

    // Create the section
    const { data: section, error: sectionError } = await supabase
      .from("looks_sections")
      .insert({
        user_id: user.id,
        name,
        description,
      })
      .select()
      .single()

    if (sectionError) {
      console.error("Error creating section:", sectionError)
      return NextResponse.json({ error: "Failed to create section" }, { status: 500 })
    }

    console.log("Created section:", section)

    return NextResponse.json(section)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
