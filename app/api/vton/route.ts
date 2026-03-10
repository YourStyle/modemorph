import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

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
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

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

    const authToken = request.headers.get("authorization")?.replace("Bearer ", "")

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

      // Try to extract meaningful error from n8n response
      let userError = "Сервис примерки временно недоступен"
      try {
        const parsed = JSON.parse(errorText)
        if (parsed?.error) userError = parsed.error
        else if (parsed?.message) userError = parsed.message
      } catch {
        // not JSON, use default
      }

      return NextResponse.json(
        { error: userError },
        { status: vtonResponse.status >= 500 ? 503 : vtonResponse.status },
      )
    }

    const vtonResult = await vtonResponse.json()

    // n8n might return 200 with error in body
    if (vtonResult?.error) {
      console.error("VTON service returned error in body:", vtonResult.error)
      return NextResponse.json(
        { error: typeof vtonResult.error === "string" ? vtonResult.error : "Ошибка сервиса примерки" },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      result: vtonResult,
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
