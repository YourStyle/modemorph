import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  console.log("🚀 API route called: /api/wardrobe/visibility")

  try {
    const supabase = createClient()
    console.log("✅ Supabase client created")

    // Проверяем аутентификацию
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      console.log("❌ Auth error:", authError.message)
      return NextResponse.json({ error: "Auth error: " + authError.message }, { status: 401 })
    }

    if (!user) {
      console.log("❌ No user found")
      return NextResponse.json({ error: "No user found" }, { status: 401 })
    }

    console.log("✅ User authenticated:", user.id)

    // Проверяем что пользователь админ
    console.log("🔍 Checking admin status...")
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("is_admin, user_id")
      .eq("user_id", user.id)
      .single()

    if (profileError) {
      console.log("❌ Profile error:", profileError.message)
      return NextResponse.json({ error: "Profile error: " + profileError.message }, { status: 500 })
    }

    console.log("📋 Profile data:", profile)

    if (!profile?.is_admin) {
      console.log("❌ User is not admin")
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    console.log("✅ User is admin")

    // Получаем данные запроса
    const body = await request.json()
    const { hideAll } = body
    console.log("📝 Request body:", { hideAll })

    // Проверяем существование таблицы и поля
    console.log("🔍 Checking table structure...")
    const { data: tableCheck, error: tableError } = await supabase
      .from("wardrobe_items")
      .select("id, is_hidden")
      .limit(1)

    if (tableError) {
      console.log("❌ Table check error:", tableError.message)
      return NextResponse.json({ error: "Table error: " + tableError.message }, { status: 500 })
    }

    console.log("✅ Table accessible, sample record:", tableCheck?.[0])

    // Выполняем обновление - ИСПРАВЛЕНО: добавил WHERE clause
    console.log("🔄 Updating wardrobe_items...")
    const {
      data,
      error: updateError,
      count,
    } = await supabase
      .from("wardrobe_items")
      .update({ is_hidden: hideAll })
      .neq("id", 0) // WHERE id != 0 (все записи, так как id всегда > 0)
      .select("id")

    if (updateError) {
      console.log("❌ Update error:", updateError)
      return NextResponse.json(
        {
          error: "Update failed: " + updateError.message,
          details: updateError,
        },
        { status: 500 },
      )
    }

    console.log("✅ Update successful:", {
      updatedCount: data?.length,
      hideAll,
    })

    return NextResponse.json({
      success: true,
      message: hideAll ? "All items hidden" : "All items shown",
      updatedCount: data?.length || 0,
    })
  } catch (error) {
    console.log("💥 Unexpected error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { itemId, isHidden } = await request.json()

    if (!itemId) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from("wardrobe_items")
      .update({ is_hidden: isHidden })
      .eq("id", itemId)

    if (updateError) {
      console.error("Database error:", updateError)
      return NextResponse.json({ error: "Failed to update item visibility" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
