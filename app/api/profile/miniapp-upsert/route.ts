export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No session" }, { status: 401 })

  const body = await req.json()
  const payload = {
    user_id: user.id,
    gender: body.gender,
    height: Number(body.height),
    weight: Number(body.weight),
    top_size: body.top_size,
    bottom_size: body.bottom_size,
    shoe_size: Number.isFinite(Number(body.shoe_size)) ? Number(body.shoe_size) : body.shoe_size,
    referral: body.referral || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
