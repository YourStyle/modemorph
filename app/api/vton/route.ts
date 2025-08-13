import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface VTONRequest {
  avatar_url: string
  items: Array<{
    name: string
    description?: string
    color?: string
    material?: string
    image_url?: string
  }>
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    // Get user profile to get avatar URL
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single()

    if (profileError || !profile?.avatar_url) {
      return NextResponse.json(
        {
          error: "User avatar not found. Please upload an avatar in your profile.",
        },
        { status: 400 },
      )
    }

    // Prepare VTON request
    const vtonRequest: VTONRequest = {
      avatar_url: profile.avatar_url,
      items: items.map((item) => ({
        name: item.name || "Unnamed item",
        description: item.description || "",
        color: item.color || "",
        material: item.material || "",
        image_url: item.image_url || "",
      })),
    }

    console.log("Sending VTON request:", vtonRequest)

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const authToken = session?.access_token

    // Use NEXT_PUBLIC_AI_API_URL + /vton
    const vtonUrl = `${process.env.NEXT_PUBLIC_AI_API_URL}/vton`

    // Make request to VTON service
    const vtonResponse = await fetch(vtonUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
      body: JSON.stringify(vtonRequest),
    })

    if (!vtonResponse.ok) {
      const errorText = await vtonResponse.text()
      console.error("VTON service error:", vtonResponse.status, errorText)
      return NextResponse.json(
        {
          error: "Virtual try-on service is temporarily unavailable",
        },
        { status: 503 },
      )
    }

    const vtonResult = await vtonResponse.json()

    return NextResponse.json({
      success: true,
      result: vtonResult,
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
