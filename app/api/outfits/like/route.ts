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

    // Update likes count
    const increment = action === "like" ? 1 : -1
    const { data: outfit, error: updateError } = await supabase
      .from("outfits")
      .update({
        likes: supabase.raw(`GREATEST(likes + ${increment}, 0)`),
      })
      .eq("id", outfitId)
      .select("likes")
      .single()

    if (updateError) {
      console.error("Error updating likes:", updateError)
      return NextResponse.json({ error: "Failed to update likes" }, { status: 500 })
    }

    return NextResponse.json({ success: true, likes: outfit.likes })
  } catch (error) {
    console.error("Error in like endpoint:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
