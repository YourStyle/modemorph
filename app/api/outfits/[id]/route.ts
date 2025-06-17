import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: "Outfit ID is required" }, { status: 400 })
    }

    // Получаем текущего пользователя
    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Получаем образ с элементами
    const { data: outfit, error } = await supabase
      .from("outfits")
      .select(`
        *,
        outfit_items (
          *,
          wardrobe_items (*)
        )
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error) {
      console.error("Error fetching outfit:", error)
      return NextResponse.json({ error: "Failed to fetch outfit" }, { status: 500 })
    }

    if (!outfit) {
      return NextResponse.json({ error: "Outfit not found" }, { status: 404 })
    }

    return NextResponse.json({ outfit })
  } catch (error) {
    console.error("Error in outfit GET API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
