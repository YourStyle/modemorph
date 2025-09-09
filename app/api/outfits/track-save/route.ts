import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { outfitId } = await request.json()
    const outfitIdNum = Number(outfitId)

    if (!Number.isFinite(outfitIdNum) || outfitIdNum <= 0) {
      return NextResponse.json({ error: "Invalid outfitId" }, { status: 400 })
    }

    const { error } = await supabase.rpc("increment_saves", { outfit_id: outfitIdNum })

    if (error) {
      console.error("Error tracking save:", error)
      return NextResponse.json({ error: "Failed to track save" }, { status: 500 })
    }

    return NextResponse.json({ tracked: true })
  } catch (e) {
    console.error("POST /api/outfits/track-save error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
