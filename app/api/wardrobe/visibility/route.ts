import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Проверяем аутентификацию
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { hideAll } = await request.json()

    // Обновляем все элементы гардероба (убираем user_id так как его нет в схеме)
    const { error: updateError } = await supabase
      .from("wardrobe_items")
      .update({ is_hidden: hideAll })

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
