import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

const normalizeBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v
  if (typeof v === "string") {
    const s = v.trim().toLowerCase()
    if (["y", "yes", "true", "1", "да"].includes(s)) return true
    return false
  }
  if (typeof v === "number") return v === 1
  return false
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    console.log("[Wardrobe API] Authenticated user:", { id: user.id, email: user.email })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Сначала проверим все записи для пользователя без фильтров
    const { data: allData, error: allError } = await supabase
      .from("wardrobe_user_items")
      .select("id, user_id, item_name, is_hidden, created_at")
      .eq("user_id", user.id)

    console.log("[Wardrobe API] All user items:", { count: allData?.length || 0, items: allData })

    // Теперь с фильтром is_hidden = false
    const { data, error } = await supabase
      .from("wardrobe_user_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })

    console.log("[Wardrobe API] Filtered items:", { count: data?.length || 0, error })

    if (error) {
      console.error("Error fetching wardrobe items:", error)
      return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error in GET /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Получаем user_profile_id для трекинга
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    const userProfileId = profile?.id

    // Проверяем количество вещей до добавления
    const { count: itemsCountBefore } = await supabase
      .from("wardrobe_user_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_hidden", false)

    const body = await req.json()

    const itemData = {
      user_id: user.id,
      item_name: body.item_name || body.name || "Без названия",
      item_name_en: body.item_name_en ?? null,
      description: body.description ?? null,
      description_en: body.description_en ?? null,
      material: body.material || "",
      color: body.color || "",
      style: body.style || "",
      has_print: normalizeBool(body.has_print),
      has_details: normalizeBool(body.has_details),
      image_url: body.image_url || null,
      basic_item_id: body.basic_item_id ? Number.parseInt(body.basic_item_id) : null,
      is_hidden: false,
      size_type: body.size_type || "",
      shade: body.shade || "",
      url: body.url || "",
      notes: body.notes || "",
      clothing_type: body.clothing_type ?? null,
    }

    const { data, error } = await supabase.from("wardrobe_user_items").insert([itemData]).select().single()

    if (error) {
      console.error("Error creating wardrobe item:", error)
      return NextResponse.json({ error: "Failed to create item", details: error.message }, { status: 500 })
    }

    // Трекинг событий после успешного добавления
    if (userProfileId && data) {
      const itemsCountAfter = (itemsCountBefore || 0) + 1

      // Трекаем первую добавленную вещь
      if (itemsCountBefore === 0) {
        try {
          const { data: existingEvent } = await supabase
            .from("user_events")
            .select("id")
            .eq("user_profile_id", userProfileId)
            .eq("event_type", "first_item_added")
            .limit(1)
            .single()

          if (!existingEvent) {
            await supabase.from("user_events").insert({
              user_profile_id: userProfileId,
              event_type: "first_item_added",
              event_data: { item_id: data.id, item_name: data.item_name, source: "user_upload" },
            })
            console.log("[Analytics] Tracked: first_item_added")
          }
        } catch (e) {
          console.error("[Analytics] Failed to track first_item_added:", e)
        }
      }

      // Трекаем milestone прогресса гардероба
      const targetCount = 50
      const percentage = Math.floor((itemsCountAfter / targetCount) * 100)

      const milestones = [
        { threshold: 30, eventType: "wardrobe_30_percent" },
        { threshold: 50, eventType: "wardrobe_50_percent" },
        { threshold: 100, eventType: "wardrobe_100_percent" },
      ]

      for (const milestone of milestones) {
        if (percentage >= milestone.threshold) {
          try {
            const { data: existingMilestone } = await supabase
              .from("user_events")
              .select("id")
              .eq("user_profile_id", userProfileId)
              .eq("event_type", milestone.eventType)
              .limit(1)
              .single()

            if (!existingMilestone) {
              await supabase.from("user_events").insert({
                user_profile_id: userProfileId,
                event_type: milestone.eventType,
                event_data: {
                  percentage: milestone.threshold,
                  items_count: itemsCountAfter,
                  target_count: targetCount,
                },
              })
              console.log(`[Analytics] Tracked: ${milestone.eventType}`)
            }
          } catch (e) {
            console.error(`[Analytics] Failed to track ${milestone.eventType}:`, e)
          }
        }
      }
    }

    // TODO: CLIP classify requires a dedicated container with the CLIP model
    // When deployed, fire-and-forget call to save embeddings here

  return NextResponse.json(data)
  } catch (error) {
    console.error("Error in POST /api/wardrobe-user-items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
