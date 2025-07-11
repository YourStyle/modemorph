import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's existing items to exclude them
    const { data: userItems, error: userItemsError } = await supabase
      .from("wardrobe_user_items")
      .select("basic_item_id")
      .eq("user_id", user.id)
      .not("basic_item_id", "is", null)

    if (userItemsError) {
      console.error("Error fetching user items:", userItemsError)
      return NextResponse.json({ error: "Failed to fetch user items" }, { status: 500 })
    }

    const existingBasicItemIds = userItems?.map((item) => item.basic_item_id) || []

    // Get all basic items excluding those already in user's wardrobe
    let query = supabase
      .from("basic_wardrobe_items")
      .select(
        "id, name_ru, description, image_url, name_en",
      )

    if (existingBasicItemIds.length > 0) {
      query = query.not("id", "in", `(${existingBasicItemIds.join(",")})`)
    }

    const { data: basicItems, error: basicItemsError } = await query

    if (basicItemsError) {
      console.error("Error fetching basic items:", basicItemsError)
      return NextResponse.json({ error: "Failed to fetch basic items" }, { status: 500 })
    }

    // Transform the data to match expected format
    const transformedItems =
      basicItems?.map((item) => ({
        id: item.id,
        item_name: item.name_ru,
        description: item.description,
        image_url: item.image_url,
        name_en: item.name_en
      })) || []

    return NextResponse.json({ items: transformedItems })
  } catch (error) {
    console.error("Error in basic-wardrobe-items API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
