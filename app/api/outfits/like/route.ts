import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = await createClient({ token });
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { outfitId, action } = await request.json()
    const outfitIdNum = Number(outfitId)
    const op: "like" | "unlike" = action === "unlike" ? "unlike" : "like"

    if (!Number.isFinite(outfitIdNum) || outfitIdNum <= 0) {
      return NextResponse.json({ error: "Invalid outfitId" }, { status: 400 })
    }

    if (op === "like") {
      const { error } = await supabase
        .from("user_likes")
        .insert([{ user_id: user.id, outfit_id: outfitIdNum }], { ignoreDuplicates: true })
      if (error) {
        console.error("Insert like error:", error)
        return NextResponse.json({ error: "Failed to like" }, { status: 500 })
      }
    } else {
      const { error } = await supabase.from("user_likes").delete().eq("user_id", user.id).eq("outfit_id", outfitIdNum)
      if (error) {
        console.error("Delete like error:", error)
        return NextResponse.json({ error: "Failed to unlike" }, { status: 500 })
      }
    }

    // Fresh totals
    const { count: total, error: countErr } = await supabase
      .from("user_likes")
      .select("*", { count: "exact", head: true })
      .eq("outfit_id", outfitIdNum)
    if (countErr) {
      console.error("Count likes error:", countErr)
      return NextResponse.json({ error: "Failed to count likes" }, { status: 500 })
    }

    const { count: myCount } = await supabase
      .from("user_likes")
      .select("*", { count: "exact", head: true })
      .eq("outfit_id", outfitIdNum)
      .eq("user_id", user.id)

    return NextResponse.json({ likes: total ?? 0, isLiked: (myCount ?? 0) > 0 })
  } catch (e) {
    console.error("POST /api/outfits/like error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
