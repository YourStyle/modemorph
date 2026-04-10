import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseYmlFeed } from "@/lib/feed-parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes max for feed processing

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Process pending partner feeds — called by cron or manually */
export async function POST() {
  const supabase = getSupabase()

  // Pick up oldest pending feed
  const { data: feed, error: feedError } = await supabase
    .from("partner_feeds")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single()

  if (feedError || !feed) {
    return NextResponse.json({ message: "No pending feeds" })
  }

  console.log(`[ProcessFeeds] Processing feed ${feed.id} (${feed.file_name})`)

  // Mark as processing
  await supabase
    .from("partner_feeds")
    .update({ status: "processing" })
    .eq("id", feed.id)

  try {
    // Download XML from S3
    const response = await fetch(feed.file_url)
    if (!response.ok) {
      throw new Error(`Failed to download feed: ${response.status}`)
    }
    const xmlString = await response.text()

    // Parse the feed
    const result = parseYmlFeed(xmlString)

    console.log(
      `[ProcessFeeds] Feed ${feed.id}: ${result.items.length} items parsed from ${result.totalOffers} offers ` +
        `(skipped: ${result.skippedCategories} categories, ${result.skippedNoImage} no image)`,
    )

    // Deduplicate and insert items
    let imported = 0
    let skipped = 0

    for (const item of result.items) {
      const notes = `${item.source}:${item.source_sku}`

      // Check if already exists (by source:sku in notes)
      const { data: existing } = await supabase
        .from("wardrobe_items")
        .select("id")
        .eq("notes", notes)
        .limit(1)
        .single()

      if (existing) {
        skipped++
        continue
      }

      const { error: insertError } = await supabase
        .from("wardrobe_items")
        .insert({
          item_name: item.item_name,
          description: item.description,
          image_url: item.image_url,
          url: item.url,
          clothing_type: item.clothing_type,
          color: item.color,
          gender: item.gender,
          style: "Casual",
          is_hidden: false,
          is_basic: false,
          notes,
          partner_id: feed.partner_id,
          feed_id: feed.id,
          price: item.price,
        })

      if (insertError) {
        console.error(`[ProcessFeeds] Insert error for ${notes}:`, insertError.message)
        skipped++
      } else {
        imported++
      }
    }

    // Update feed status
    await supabase
      .from("partner_feeds")
      .update({
        status: "completed",
        items_total: result.items.length,
        items_imported: imported,
        items_skipped: skipped,
        completed_at: new Date().toISOString(),
      })
      .eq("id", feed.id)

    console.log(
      `[ProcessFeeds] Feed ${feed.id} completed: ${imported} imported, ${skipped} skipped`,
    )

    // Trigger CLIP index rebuild if items were imported
    if (imported > 0) {
      const clipUrl = process.env.CLIP_SERVICE_URL || "http://localhost:8000"
      fetch(`${clipUrl}/clip/build-index`, { method: "POST" }).catch((err) => {
        console.error("[ProcessFeeds] Failed to trigger CLIP rebuild:", err.message)
      })
    }

    return NextResponse.json({
      success: true,
      feed_id: feed.id,
      imported,
      skipped,
      total_parsed: result.items.length,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error(`[ProcessFeeds] Feed ${feed.id} failed:`, errorMessage)

    await supabase
      .from("partner_feeds")
      .update({
        status: "failed",
        error_log: errorMessage,
      })
      .eq("id", feed.id)

    return NextResponse.json(
      { error: `Feed processing failed: ${errorMessage}` },
      { status: 500 },
    )
  }
}
