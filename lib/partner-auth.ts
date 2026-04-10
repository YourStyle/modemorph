// lib/partner-auth.ts
// Server-side auth helper for partner cabinet (session-based, Bearer token)

import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAuthUser, type AuthUser } from "@/lib/auth-server"

export interface PartnerProfile {
  id: number
  user_id: string
  company_name: string
  contact_name: string
  website: string | null
  description: string | null
  status: "pending" | "approved" | "rejected" | "suspended"
  rejected_reason: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

interface PartnerUserResult {
  user: AuthUser
  partner: PartnerProfile
}

/** Get authenticated partner from Bearer token. Returns null if not a partner. */
export async function getPartnerUser(req: NextRequest): Promise<PartnerUserResult | null> {
  const user = await getAuthUser(req)
  if (!user) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: partner, error } = await supabase
    .from("partner_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single()

  if (error || !partner) {
    console.log("[PartnerAuth] No partner profile for user:", user.id)
    return null
  }

  return { user, partner: partner as PartnerProfile }
}
