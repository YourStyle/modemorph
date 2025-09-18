import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = await createClient({ token });
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // If unauthenticated, return empty liked list (UI remains stable)
    if (!user) return NextResponse.json({ liked: [] })

    const { data, error } = await supabase.from("user_likes").select("outfit_id").eq("user_id", user.id)

    if (error) {
      console.warn("GET /api/user-likes select error:", error)
      return NextResponse.json({ liked: [] })
    }

    const liked = (data ?? []).map((r) => String(r.outfit_id))
    return NextResponse.json({ liked })
  } catch (e) {
    console.error("GET /api/user-likes error:", e)
    return NextResponse.json({ liked: [] })
  }
}
