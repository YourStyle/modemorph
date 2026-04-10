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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await checkAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const supabase = getSupabase()

  const { data: partner, error } = await supabase
    .from("partner_profiles")
    .select("*")
    .eq("id", parseInt(id))
    .single()

  if (error || !partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 })
  }

  // Get tokens
  const { data: tokens } = await supabase
    .from("partner_api_tokens")
    .select("id, name, token_prefix, is_active, created_at, last_used_at, revoked_at")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })

  // Get feeds
  const { data: feeds } = await supabase
    .from("partner_feeds")
    .select("*")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })

  // Get recent usage
  const { data: recentUsage } = await supabase
    .from("partner_api_usage")
    .select("*")
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(50)

  // Get total counts
  const { count: totalCalls } = await supabase
    .from("partner_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id)

  const { count: successCalls } = await supabase
    .from("partner_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id)
    .eq("status_code", 200)

  return NextResponse.json({
    partner,
    tokens: tokens ?? [],
    feeds: feeds ?? [],
    recent_usage: recentUsage ?? [],
    stats: {
      total_calls: totalCalls ?? 0,
      success_calls: successCalls ?? 0,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await checkAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, rejected_reason } = body

  if (!status || !["approved", "rejected", "suspended"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be: approved, rejected, or suspended" },
      { status: 400 },
    )
  }

  const supabase = getSupabase()

  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === "approved") {
    updateData.approved_at = new Date().toISOString()
    updateData.approved_by = admin.id
    updateData.rejected_reason = null
  }

  if (status === "rejected" && rejected_reason) {
    updateData.rejected_reason = rejected_reason
  }

  const { data: partner, error } = await supabase
    .from("partner_profiles")
    .update(updateData)
    .eq("id", parseInt(id))
    .select()
    .single()

  if (error) {
    console.error("[Admin Partners] Update error:", error)
    return NextResponse.json({ error: "Failed to update partner" }, { status: 500 })
  }

  console.log(`[Admin Partners] Partner ${id} status changed to ${status} by admin ${admin.id}`)

  return NextResponse.json({ success: true, partner })
}
