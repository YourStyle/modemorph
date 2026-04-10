import { type NextRequest, NextResponse } from "next/server"
import { getPartnerUser } from "@/lib/partner-auth"
import { getAuthUser } from "@/lib/auth-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // First check basic auth
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Then check partner profile
    const result = await getPartnerUser(request)
    if (!result) {
      return NextResponse.json(
        { error: "not_a_partner", message: "Партнёрский профиль не найден" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
      },
      partner: result.partner,
    })
  } catch (error) {
    console.error("[Partner Me] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
