import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { company_name, contact_name, website, description } = body

    if (!company_name || !contact_name) {
      return NextResponse.json(
        { error: "Название компании и контактное лицо обязательны" },
        { status: 400 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Check if already registered as partner
    const { data: existing } = await supabase
      .from("partner_profiles")
      .select("id, status")
      .eq("user_id", user.id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: "Вы уже зарегистрированы как партнёр", status: existing.status },
        { status: 409 },
      )
    }

    // Create partner profile
    const { data: partner, error } = await supabase
      .from("partner_profiles")
      .insert({
        user_id: user.id,
        company_name: company_name.trim(),
        contact_name: contact_name.trim(),
        website: website?.trim() || null,
        description: description?.trim() || null,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("[Partner Register] Insert error:", error)
      return NextResponse.json({ error: "Ошибка при регистрации" }, { status: 500 })
    }

    console.log(`[Partner Register] New partner registered: ${partner.id} (${company_name})`)

    return NextResponse.json({
      success: true,
      partner: {
        id: partner.id,
        company_name: partner.company_name,
        status: partner.status,
      },
    })
  } catch (error) {
    console.error("[Partner Register] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
