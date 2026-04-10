// lib/partner-token-auth.ts
// Server-side auth for public partner API (X-API-Key header)

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

export interface PartnerTokenInfo {
  partnerId: number
  tokenId: number
  rateLimitPerMinute: number
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Hash an API key with SHA-256 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

/** Generate a new API key: mm_pk_ + 32 random bytes as hex */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString("hex")
  const key = `mm_pk_${raw}`
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, 14), // "mm_pk_" + first 8 hex chars
  }
}

/** Authenticate partner via X-API-Key header. Returns null on failure. */
export async function getPartnerFromToken(req: NextRequest): Promise<PartnerTokenInfo | null> {
  const apiKey = req.headers.get("x-api-key")
  if (!apiKey) return null

  const hash = hashApiKey(apiKey)
  const supabase = getSupabase()

  // Look up token
  const { data: token, error } = await supabase
    .from("partner_api_tokens")
    .select("id, partner_id, is_active, rate_limit_per_minute")
    .eq("token_hash", hash)
    .single()

  if (error || !token || !token.is_active) return null

  // Check partner is approved
  const { data: partner } = await supabase
    .from("partner_profiles")
    .select("status")
    .eq("id", token.partner_id)
    .single()

  if (!partner || partner.status !== "approved") return null

  // Update last_used_at (fire-and-forget)
  supabase
    .from("partner_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", token.id)
    .then()

  return {
    partnerId: token.partner_id,
    tokenId: token.id,
    rateLimitPerMinute: token.rate_limit_per_minute,
  }
}

/** Check rate limit for a token. Returns true if within limit. */
export async function checkRateLimit(
  tokenId: number,
  limit: number,
): Promise<boolean> {
  const supabase = getSupabase()
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()

  const { count } = await supabase
    .from("partner_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("token_id", tokenId)
    .gte("created_at", oneMinuteAgo)

  return (count ?? 0) < limit
}

/** Log an API call to partner_api_usage */
export async function logApiUsage(params: {
  partnerId: number
  tokenId: number
  endpoint: string
  statusCode: number
  errorCode?: string
  latencyMs?: number
}) {
  const supabase = getSupabase()
  await supabase.from("partner_api_usage").insert({
    partner_id: params.partnerId,
    token_id: params.tokenId,
    endpoint: params.endpoint,
    status_code: params.statusCode,
    error_code: params.errorCode ?? null,
    latency_ms: params.latencyMs ?? null,
  })
}

/** JSON error response helper for public API */
export function apiError(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  )
}
