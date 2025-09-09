import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: recommendations, error } = await supabase
      .from("user_recommendations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user recommendations:", error)
      return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 })
    }

    return NextResponse.json(recommendations || [])
  } catch (error) {
    console.error("Error in GET /api/user-recommendations:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { recommendations } = body

    if (!recommendations || !Array.isArray(recommendations)) {
      return NextResponse.json({ error: "Invalid recommendations data" }, { status: 400 })
    }

    console.log("Saving recommendations for user:", user.id, "Count:", recommendations.length)

    // Filter recommendations that contain only user items (no suggested items)
    const userOnlyRecommendations = recommendations.filter((rec: any) => {
      const hasOnlyUserItems = rec.items.every((item: any) => item.user_id)
      console.log(`Recommendation "${rec.title}": hasOnlyUserItems=${hasOnlyUserItems}`)
      return hasOnlyUserItems
    })

    console.log("Filtered recommendations (user items only):", userOnlyRecommendations.length)

    if (userOnlyRecommendations.length === 0) {
      return NextResponse.json({ message: "No recommendations with user-only items to save" })
    }

    // Prepare data for insertion
    const recommendationsToInsert = userOnlyRecommendations.map((rec: any) => ({
      user_id: user.id,
      recommendation_id: rec.id,
      title: rec.title,
      description: `Рекомендация с ${rec.items.length} вещами из вашего гардероба`,
      items: rec.items.map((item: any) => ({
        type: "user",
        id: Number.parseInt(item.id),
        name: item.name,
        image_url: item.image_url,
        color: item.color,
      })),
    }))

    // Use upsert to avoid duplicates
    const { data: savedRecommendations, error } = await supabase
      .from("user_recommendations")
      .upsert(recommendationsToInsert, {
        onConflict: "user_id,recommendation_id",
        ignoreDuplicates: false,
      })
      .select()

    if (error) {
      console.error("Error saving recommendations:", error)
      return NextResponse.json({ error: "Failed to save recommendations" }, { status: 500 })
    }

    console.log("Saved recommendations:", savedRecommendations?.length || 0)

    return NextResponse.json({
      message: "Recommendations saved successfully",
      saved_count: savedRecommendations?.length || 0,
    })
  } catch (error) {
    console.error("Error in POST /api/user-recommendations:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
