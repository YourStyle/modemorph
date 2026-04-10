import { type NextRequest, NextResponse } from "next/server"
import { getPartnerUser } from "@/lib/partner-auth"
import { generateApiKey } from "@/lib/partner-token-auth"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** List all tokens for the authenticated partner */
export async function GET(request: NextRequest) {
  const result = await getPartnerUser(request)
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (result.partner.status !== "approved") {
    return NextResponse.json({ error: "Partner not approved" }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data: tokens, error } = await supabase
    .from("partner_api_tokens")
    .select("id, name, token_prefix, is_active, rate_limit_per_minute, last_used_at, created_at, revoked_at")
    .eq("partner_id", result.partner.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: "Failed to fetch tokens" }, { status: 500 })
  }

  return NextResponse.json({ tokens: tokens ?? [] })
}

/** Create a new API token */
export async function POST(request: NextRequest) {
  const result = await getPartnerUser(request)
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (result.partner.status !== "approved") {
    return NextResponse.json({ error: "Partner not approved" }, { status: 403 })
  }

  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Название токена обязательно" }, { status: 400 })
  }

  // Limit max tokens per partner
  const supabase = getSupabase()
  const { count } = await supabase
    .from("partner_api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", result.partner.id)
    .eq("is_active", true)

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: "Максимум 10 активных токенов" },
      { status: 400 },
    )
  }

  const { key, hash, prefix } = generateApiKey()

  const { data: token, error } = await supabase
    .from("partner_api_tokens")
    .insert({
      partner_id: result.partner.id,
      name: name.trim(),
      token_hash: hash,
      token_prefix: prefix,
    })
    .select("id, name, token_prefix, created_at")
    .single()

  if (error) {
    console.error("[Partner Tokens] Insert error:", error)
    return NextResponse.json({ error: "Не удалось создать токен" }, { status: 500 })
  }

  console.log(`[Partner Tokens] New token created for partner ${result.partner.id}: ${prefix}...`)

  // Return the plaintext key ONCE — it cannot be retrieved later
  return NextResponse.json({
    token: {
      ...token,
      key, // plaintext — show to user once
    },
  })
}
