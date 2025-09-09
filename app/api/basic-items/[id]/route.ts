import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const id = Number.parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
    }

    const { data, error } = await supabase.from("basic_wardrobe_items").select("*").eq("id", id).single()

    if (error) {
      console.error("Error fetching basic item:", error)
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error in GET /api/basic-items/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
