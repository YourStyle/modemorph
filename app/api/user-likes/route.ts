import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    // If unauthenticated, return empty liked list (UI remains stable)
    if (!user) return NextResponse.json({ liked: [] })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

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
