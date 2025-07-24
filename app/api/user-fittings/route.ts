import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: fittings, error } = await supabase
      .from("user_fittings")
      .select(`
        *,
        user_avatars (
          id,
          image_url
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching fittings:", error)
      return NextResponse.json({ error: "Failed to fetch fittings" }, { status: 500 })
    }

    return NextResponse.json({ fittings })
  } catch (error) {
    console.error("Error in GET /api/user-fittings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { outfit_items } = await request.json()

    if (!outfit_items || !Array.isArray(outfit_items) || outfit_items.length === 0) {
      return NextResponse.json({ error: "Outfit items are required" }, { status: 400 })
    }

    // Получаем активный аватар пользователя
    const { data: activeAvatar, error: avatarError } = await supabase
      .from("user_avatars")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (avatarError || !activeAvatar) {
      return NextResponse.json(
        { error: "No active avatar found. Please upload and set an avatar first." },
        { status: 400 },
      )
    }

    // Создаем запись примерки
    const { data: fitting, error: fittingError } = await supabase
      .from("user_fittings")
      .insert({
        user_id: user.id,
        avatar_id: activeAvatar.id,
        outfit_items,
        status: "pending",
      })
      .select()
      .single()

    if (fittingError) {
      console.error("Error creating fitting:", fittingError)
      return NextResponse.json({ error: "Failed to create fitting" }, { status: 500 })
    }

    // Отправляем запрос на AI API для примерки
    try {
      const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL
      if (!aiApiUrl) {
        throw new Error("AI API URL not configured")
      }

      // Обновляем статус на processing
      await supabase.from("user_fittings").update({ status: "processing" }).eq("id", fitting.id)

      // Подготавливаем данные для AI API
      const vtonRequest = {
        person_image: activeAvatar.image_url,
        items: outfit_items.map((item) => ({
          id: item.id,
          source: item.source,
        })),
      }

      const response = await fetch(`${aiApiUrl}/vton`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vtonRequest),
      })

      if (!response.ok) {
        throw new Error(`AI API responded with status: ${response.status}`)
      }

      const result = await response.json()

      // Обновляем запись с результатом
      await supabase
        .from("user_fittings")
        .update({
          status: "completed",
          result_image_url: result.result_image_url,
        })
        .eq("id", fitting.id)

      return NextResponse.json({
        fitting: {
          ...fitting,
          status: "completed",
          result_image_url: result.result_image_url,
        },
      })
    } catch (aiError) {
      console.error("Error processing AI request:", aiError)

      // Обновляем статус на failed
      await supabase
        .from("user_fittings")
        .update({
          status: "failed",
          error_message: aiError instanceof Error ? aiError.message : "Unknown AI processing error",
        })
        .eq("id", fitting.id)

      return NextResponse.json({
        fitting: {
          ...fitting,
          status: "failed",
          error_message: aiError instanceof Error ? aiError.message : "Unknown AI processing error",
        },
      })
    }
  } catch (error) {
    console.error("Error in POST /api/user-fittings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
