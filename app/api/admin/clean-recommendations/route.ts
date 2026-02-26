import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAdminUser } from "@/lib/admin-auth"
import { filterSections, type FilterStats } from "@/lib/recommendation-filters"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** GET — dry run: scan all main_recommendations and report anomalies */
export async function GET(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabase()

  const { data: rows, error } = await supabase
    .from("main_recommendations")
    .select("user_id, run_date, look_sections")
    .order("run_date", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const anomalies: Array<{
    user_id: string
    run_date: string
    stats: FilterStats
    sectionsBefore: number
    sectionsAfter: number
  }> = []

  let totalAffected = 0

  for (const row of rows || []) {
    const sections = normalizeSections(row.look_sections)
    const { sections: cleaned, stats } = filterSections(sections, 2)

    if (stats.totalRemoved > 0) {
      totalAffected++
      anomalies.push({
        user_id: row.user_id,
        run_date: row.run_date,
        stats,
        sectionsBefore: sections.length,
        sectionsAfter: cleaned.length,
      })
    }
  }

  return NextResponse.json({
    dryRun: true,
    totalRows: rows?.length || 0,
    totalAffected,
    anomalies,
  })
}

/** POST — apply cleanup: rewrite look_sections with cleaned data */
export async function POST(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabase()

  const { data: rows, error } = await supabase
    .from("main_recommendations")
    .select("user_id, run_date, look_sections")
    .order("run_date", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let cleaned = 0
  let failed = 0

  for (const row of rows || []) {
    const sections = normalizeSections(row.look_sections)
    const { sections: cleanedSections, stats } = filterSections(sections, 2)

    if (stats.totalRemoved === 0) continue

    const { error: updateErr } = await supabase
      .from("main_recommendations")
      .update({ look_sections: cleanedSections })
      .eq("user_id", row.user_id)
      .eq("run_date", row.run_date)

    if (updateErr) {
      console.error("[clean-recommendations] Update failed for", row.user_id, updateErr)
      failed++
    } else {
      cleaned++
    }
  }

  // Audit log
  await supabase.from("user_events").insert({
    user_id: user.id,
    event_type: "recommendations_cleaned",
    event_data: { cleaned, failed, totalRows: rows?.length || 0 },
  })

  return NextResponse.json({ cleaned, failed, totalRows: rows?.length || 0 })
}

// ─── Helpers ────────────────────────────────────────────────────

function normalizeSections(val: unknown): any[] {
  try {
    if (Array.isArray(val)) return val
    if (typeof val === "string") {
      const parsed = JSON.parse(val)
      return Array.isArray(parsed) ? parsed : []
    }
    return []
  } catch {
    return []
  }
}
