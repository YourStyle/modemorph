import { type NextRequest, NextResponse } from "next/server"
import { getPartnerUser } from "@/lib/partner-auth"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Get feed detail */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getPartnerUser(request)
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: feed, error } = await supabase
    .from("partner_feeds")
    .select("*")
    .eq("id", parseInt(id))
    .eq("partner_id", result.partner.id)
    .single()

  if (error || !feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 })
  }

  // Get items imported from this feed
  const { count: itemsCount } = await supabase
    .from("wardrobe_items")
    .select("id", { count: "exact", head: true })
    .eq("feed_id", feed.id)

  return NextResponse.json({
    feed,
    items_in_db: itemsCount ?? 0,
  })
}
