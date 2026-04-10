import { type NextRequest, NextResponse } from "next/server"
import { getPartnerUser } from "@/lib/partner-auth"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Revoke (deactivate) a token */
export async function DELETE(
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

  // Make sure the token belongs to this partner
  const { data: token } = await supabase
    .from("partner_api_tokens")
    .select("id, partner_id")
    .eq("id", parseInt(id))
    .single()

  if (!token || token.partner_id !== result.partner.id) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("partner_api_tokens")
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", parseInt(id))

  if (error) {
    return NextResponse.json({ error: "Failed to revoke token" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
