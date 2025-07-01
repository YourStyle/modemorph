import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Fetching wardrobe items for user:", user.id)

    const { data: items, error } = await supabase
      .from("wardrobe_user_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    console.log("Found items:", items?.length || 0)

    return NextResponse.json(items || [])
  } catch (error) {
    console.error("Error in GET /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
