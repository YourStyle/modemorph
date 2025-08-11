import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { outfitId, action } = await request.json()

    if (!outfitId || !action) {
      return NextResponse.json({ error: "Outfit ID and action are required" }, { status: 400 })
    }

    const supabase = createClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Read current likes
    const { data: current, error: fetchError } = await supabase
      .from("outfits")
      .select("likes")
      .eq("id", outfitId)
      .single()

    if (fetchError || !current) {
      console.error("Error reading current likes:", fetchError)
      return NextResponse.json({ error: "Failed to read likes" }, { status: 500 })
    }

    const increment = action === "like" ? 1 : -1
    const newLikes = Math.max(0, (current.likes ?? 0) + increment)

    // Update likes
    const { data: updated, error: updateError } = await supabase
      .from("outfits")
      .update({ likes: newLikes })
      .eq("id", outfitId)
      .select("likes")
      .single()

    if (updateError || !updated) {
      console.error("Error updating likes:", updateError)
      return NextResponse.json({ error: "Failed to update likes" }, { status: 500 })
    }

    return NextResponse.json({ success: true, likes: updated.likes, isLiked: action === "like" })
  } catch (error) {
    console.error("Error in like endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
