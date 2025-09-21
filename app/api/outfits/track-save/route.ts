import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { outfitId } = await req.json()
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
