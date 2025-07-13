import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import type { Database } from "@/lib/database.types"

export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  const supabase = createRouteHandlerClient<Database>({ cookies })

  const { data: sections, error } = await supabase
    .from("looks_sections")
    .select(`
      id,
      name,
      section_looks (
        id,
        user_looks (
          id,
          name,
          items
        )
      )
    `)
    .order("id")

  if (error) {
    console.error(error)
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Expand items for each look in sections
  const expandedSections = await Promise.all(
    sections.map(async (section) => {
      if (section.section_looks) {
        const expandedSectionLooks = await Promise.all(
          section.section_looks.map(async (sectionLook: any) => {
            const look = sectionLook.user_looks

            const expandedItems = await Promise.all(
              look.items.map(async (item: any) => {
                if (item.type === "user") {
                  // Get user wardrobe item
                  const { data: userItem } = await supabase
                    .from("wardrobe_items")
                    .select(`
                      id,
                      item_name,
                      image_url,
                      color,
                      material,
                      basic_wardrobe_items (
                        name_ru
                      )
                    `)
                    .eq("id", item.id)
                    .single()

                  return userItem ? { ...userItem, source: "user" } : null
                } else if (item.type === "basic") {
                  // Get basic wardrobe item
                  const { data: basicItem } = await supabase
                    .from("basic_wardrobe_items")
                    .select("id, name_ru, description, image_url")
                    .eq("id", item.id)
                    .single()

                  return basicItem ? { ...basicItem, source: "basic" } : null
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
      }
      return section
    }),
  )

  return NextResponse.json(expandedSections)
}
