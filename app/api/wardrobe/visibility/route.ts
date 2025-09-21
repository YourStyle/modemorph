import { type NextRequest, NextResponse } from "next/server"
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

    const { hideAll } = await req.json()

    // Обновляем все элементы гардероба пользователя
    const { error: updateError } = await supabase
      .from("wardrobe_items")
      .update({ is_hidden: hideAll })
      // RLS should ensure only the current user's rows are updated

    if (updateError) {
      console.error("Database error:", updateError)
      return NextResponse.json({ error: "Failed to update items visibility" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: hideAll ? "All items hidden" : "All items shown",
    })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
