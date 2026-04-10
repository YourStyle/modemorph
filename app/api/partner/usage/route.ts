import { type NextRequest, NextResponse } from "next/server"
import { getPartnerUser } from "@/lib/partner-auth"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  const result = await getPartnerUser(request)
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (result.partner.status !== "approved") {
    return NextResponse.json({ error: "Partner not approved" }, { status: 403 })
  }

  const supabase = getSupabase()
  const partnerId = result.partner.id
  const { searchParams } = new URL(request.url)
  const isSummary = searchParams.get("summary") === "true"

  // Get token count
  const { count: tokensCount } = await supabase
    .from("partner_api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("is_active", true)

  // Get feed count
  const { count: feedsCount } = await supabase
    .from("partner_feeds")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)

  // Get total API calls
  const { count: totalCalls } = await supabase
    .from("partner_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)

  // Get today's API calls
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: todayCalls } = await supabase
    .from("partner_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .gte("created_at", todayStart.toISOString())

  // Get success count
  const { count: successCalls } = await supabase
    .from("partner_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("status_code", 200)

  const successRate = (totalCalls ?? 0) > 0
    ? Math.round(((successCalls ?? 0) / (totalCalls ?? 1)) * 100)
    : 0

  if (isSummary) {
    return NextResponse.json({
      tokens_count: tokensCount ?? 0,
      feeds_count: feedsCount ?? 0,
      api_calls_today: todayCalls ?? 0,
      api_calls_total: totalCalls ?? 0,
      success_rate: successRate,
    })
  }

  // Full stats — get daily breakdown for last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentUsage } = await supabase
    .from("partner_api_usage")
    .select("status_code, error_code, latency_ms, created_at")
    .eq("partner_id", partnerId)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true })

  // Aggregate by day
  const dailyStats: Record<string, { date: string; total: number; success: number; errors: number; avg_latency: number }> = {}

  for (const row of recentUsage ?? []) {
    const day = row.created_at.slice(0, 10) // YYYY-MM-DD
    if (!dailyStats[day]) {
      dailyStats[day] = { date: day, total: 0, success: 0, errors: 0, avg_latency: 0 }
    }
    dailyStats[day].total++
    if (row.status_code === 200) {
      dailyStats[day].success++
    } else {
      dailyStats[day].errors++
    }
    if (row.latency_ms) {
      const prev = dailyStats[day]
      prev.avg_latency = prev.avg_latency + (row.latency_ms - prev.avg_latency) / prev.total
    }
  }

  // Error breakdown
  const errorBreakdown: Record<string, number> = {}
  for (const row of recentUsage ?? []) {
    if (row.error_code) {
      errorBreakdown[row.error_code] = (errorBreakdown[row.error_code] || 0) + 1
    }
  }

  return NextResponse.json({
    tokens_count: tokensCount ?? 0,
    feeds_count: feedsCount ?? 0,
    api_calls_today: todayCalls ?? 0,
    api_calls_total: totalCalls ?? 0,
    success_rate: successRate,
    daily: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
    error_breakdown: errorBreakdown,
  })
}
