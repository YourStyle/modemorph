import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function checkAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return null

  const supabase = getSupabase()
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single()

  if (!profile?.is_admin) return null
  return user
}

export async function GET(request: NextRequest) {
  const admin = await checkAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") // pending, approved, rejected, suspended, or null for all

  let query = supabase
    .from("partner_profiles")
    .select("*")
    .order("created_at", { ascending: false })

  if (status) {
    query = query.eq("status", status)
  }

  const { data: partners, error } = await query

  if (error) {
    console.error("[Admin Partners] List error:", error)
    return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 })
  }

  // Get usage counts per partner
  const partnerIds = partners?.map((p) => p.id) ?? []
  let usageCounts: Record<number, number> = {}

  if (partnerIds.length > 0) {
    const { data: usage } = await supabase
      .from("partner_api_usage")
      .select("partner_id")
      .in("partner_id", partnerIds)

    if (usage) {
      for (const row of usage) {
        usageCounts[row.partner_id] = (usageCounts[row.partner_id] || 0) + 1
      }
    }
  }

  const enriched = (partners ?? []).map((p) => ({
    ...p,
    api_calls_total: usageCounts[p.id] || 0,
  }))

  return NextResponse.json({ partners: enriched })
}
